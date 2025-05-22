
"use client"

import type React from "react"
import { useRef, useState, useEffect } from "react"
import axios from "axios"
import {
  Camera,
  Upload,
  Loader,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Zap,
  Shield,
  Scan,
  Cpu,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Define a more specific type for the image size state
interface ImageDimensions {
  width: number // Displayed width
  height: number // Displayed height
  naturalWidth: number // Original width
  naturalHeight: number // Original height
}

// Define a type for the prediction data
interface Prediction {
  bbox: [number, number, number, number] // [x1, y1, x2, y2]
  class: string
  confidence: number
}

export default function WeldingDefectDetector() {
  const [imageURL, setImageURL] = useState<string | null>(null)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [imageSize, setImageSize] = useState<ImageDimensions | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [scanAnimation, setScanAnimation] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user")

  // Function to handle file uploads
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Revoke previous blob URL if exists to prevent memory leaks
    if (imageURL) {
      URL.revokeObjectURL(imageURL)
    }

    await processImage(file)
  }

  // Function to process the image and get predictions
  const processImage = async (file: File) => {
    const url = URL.createObjectURL(file)
    setImageURL(url)
    setPredictions([]) // Clear previous predictions
    setImageSize(null) // Clear previous dimensions
    setError(null)
    setIsLoading(true)
    setScanAnimation(true)

    const formData = new FormData()
    formData.append("file", file)

    try {
      // Using your Next.js API route proxy
      const res = await axios.post<{ predictions: Prediction[] }>("/api/model", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })
      // Ensure predictions is always an array
      setPredictions(res.data.predictions || [])
    } catch (err: any) {
      console.error("Upload failed:", err)
      setError(err.response?.data?.error || err.message || "Failed to analyze image")
    } finally {
      setIsLoading(false)
      // Keep scan animation for a bit longer for visual effect
      setTimeout(() => setScanAnimation(false), 1000)
    }
  }

  // Function to start the camera
  const startCamera = async () => {
    setIsCameraActive(true)
    if (videoRef.current) {
      try {
        // First try to detect if this is a mobile device
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

        // For mobile devices, try to use the back camera first
        // For laptops/PCs, use the default (usually front) camera
        const constraints = {
          video: isMobile ? { facingMode: { ideal: "environment" } } : { facingMode: "user" },
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        videoRef.current.srcObject = stream
      } catch (err) {
        console.error("Error accessing camera:", err)

        // If environment camera fails, try the user-facing camera as fallback
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
          })

          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream
          }
        } catch (fallbackErr) {
          console.error("Fallback camera also failed:", fallbackErr)
          setError("Could not access camera. Please check permissions and ensure your device has a camera.")
          setIsCameraActive(false)
        }
      }
    }
  }

  // Function to switch between front and back cameras
  const switchCamera = async () => {
    // Stop current camera stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      const tracks = stream.getTracks()
      tracks.forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }

    // Toggle camera mode
    const newMode = cameraFacingMode === "user" ? "environment" : "user"
    setCameraFacingMode(newMode)

    // Start new camera stream
    if (videoRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newMode },
        })
        videoRef.current.srcObject = stream
      } catch (err) {
        console.error(`Error accessing ${newMode} camera:`, err)
        setError(`Could not access ${newMode === "user" ? "front" : "back"} camera.`)

        // Try to revert to the previous camera
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: cameraFacingMode },
          })
          videoRef.current.srcObject = fallbackStream
        } catch (fallbackErr) {
          console.error("Failed to revert to previous camera:", fallbackErr)
          setIsCameraActive(false)
        }
      }
    }
  }

  // Function to stop the camera
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      const tracks = stream.getTracks()
      tracks.forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    setIsCameraActive(false)
  }

  // Function to capture a photo from the camera
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // Draw the current video frame to the canvas
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Convert canvas to blob
        canvas.toBlob(
          async (blob) => {
            if (blob) {
              // Stop the camera after taking the photo
              stopCamera()

              // Process the captured image
              await processImage(new File([blob], "camera-capture.jpg", { type: "image/jpeg" }))
            }
          },
          "image/jpeg",
          0.95,
        )
      }
    }
  }

  // Function to update image dimensions state
  const updateImageDimensions = () => {
    if (imageRef.current) {
      // Ensure naturalWidth/Height are available and > 0 before setting state
      if (imageRef.current.naturalWidth > 0 && imageRef.current.naturalHeight > 0) {
        setImageSize({
          width: imageRef.current.clientWidth,
          height: imageRef.current.clientHeight,
          naturalWidth: imageRef.current.naturalWidth,
          naturalHeight: imageRef.current.naturalHeight,
        })
      }
    }
  }

  // Update dimensions when the image loads
  const handleImageLoad = () => {
    updateImageDimensions()
  }

  // Effect for handling window resize
  useEffect(() => {
    const handleResize = () => {
      // Only update dimensions if an image is loaded
      if (imageRef.current && imageURL) {
        updateImageDimensions()
      }
    }

    window.addEventListener("resize", handleResize)
    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [imageURL])

  // Effect to revoke blob URL on unmount
  useEffect(() => {
    // Store the current imageURL in a variable accessible by the cleanup function
    const currentImageURL = imageURL
    return () => {
      if (currentImageURL) {
        URL.revokeObjectURL(currentImageURL)
      }
      // Also ensure camera is stopped when component unmounts
      if (isCameraActive) {
        stopCamera()
      }
    }
  }, [imageURL, isCameraActive])

  const renderBoxes = () => {
    // Ensure we have valid image dimensions and predictions
    if (!imageSize || !imageSize.naturalWidth || !imageSize.naturalHeight || predictions.length === 0) {
      return null
    }

    // Calculate scaling factors
    const scaleX = imageSize.width / imageSize.naturalWidth
    const scaleY = imageSize.height / imageSize.naturalHeight

    return predictions.map((pred, index) => {
      // Original coordinates from API
      // const [x1_orig, y1_orig, x2_orig, y2_orig] = pred.bbox

      // // Scale the coordinates and dimensions
      // const scaledX1 = x1_orig * scaleX
      // const scaledY1 = y1_orig * scaleY
      // const scaledWidth = (x2_orig - x1_orig) * scaleX
      // const scaledHeight = (y2_orig - y1_orig) * scaleY

      // const isBad = pred.class.toLowerCase().includes("bad")
      // const color = isBad ? "#ff3b30" : "#34c759"

      // const boxStyle: React.CSSProperties = {
      //   position: "absolute",
      //   left: `${scaledX1}px`,
      //   top: `${scaledY1}px`,
      //   width: `${scaledWidth}px`,
      //   height: `${scaledHeight}px`,
      //   border: `2px solid ${color}`,
      //   backgroundColor: `${isBad ? "rgba(255, 59, 48, 0.25)" : "rgba(52, 199, 89, 0.25)"}`,
      //   color: "#fff",
      //   fontSize: "12px",
      //   padding: "2px 4px",
      //   pointerEvents: "none",
      //   boxSizing: "border-box",
      //   borderRadius: "4px",
      //   backdropFilter: "blur(2px)",
      //   boxShadow: `0 0 15px ${color}`,
      //   animation: "pulse 2s infinite",
      // }

      // return (
      //   <div key={index} style={boxStyle}>
      //     <span className="bg-black bg-opacity-70 px-1 py-0.5 rounded text-xs backdrop-blur-sm">
      //       {pred.class} ({(pred.confidence * 100).toFixed(1)}%)
      //     </span>
      //   </div>
      // )
    })
  }

  // Calculate overall result
  const getOverallResult = () => {
    if (predictions.length === 0) return null

    const hasBadWeld = predictions.some((pred) => pred.class.toLowerCase().includes("bad"))

    return hasBadWeld ? "Defects Detected" : "No Defects"
  }

  const overallResult = getOverallResult()

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8 overflow-hidden relative">
      {/* Background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGRlZnM+CjxwYXR0ZXJuIGlkPSJncmlkIiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPgo8cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmEyYTJhIiBzdHJva2Utd2lkdGg9IjAuNSIgb3BhY2l0eT0iMC4zIi8+CjwvcGF0dGVybj4KPC9kZWZzPgo8cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+Cjwvc3ZnPgo=')] opacity-20"></div>
        
        {/* Subtle gradient overlays */}
        <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-gradient-radial from-blue-500/5 via-transparent to-transparent"></div>
        <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-gradient-radial from-purple-500/5 via-transparent to-transparent"></div>
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Enhanced Header */}
        <header className="mb-12 text-center relative">
          {/* Top accent line */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
          
          <div className="inline-flex items-center justify-center mb-6 p-1 rounded-full bg-gray-800/50 border border-gray-700/50 backdrop-blur-sm">
            <div className="flex items-center px-4 py-2 rounded-full bg-gray-900/50">
              <Shield className="w-4 h-4 text-blue-400 mr-2" />
              <span className="text-sm text-gray-300 font-medium">DEFEX AI SYSTEM</span>
            </div>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-white via-gray-200 to-white bg-clip-text text-transparent">
            Defex AI
          </h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-gray-200">
            Welding Inspection
          </h2>
          
          <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed mb-8">
Advanced AI for inspecting welding defects          </p>

          {/* Action buttons */}
        

          {/* Status indicator */}
       
        </header>

        {/* Main upload card */}
        <Card className="bg-gray-900/50 border-gray-700/50 backdrop-blur-sm mb-8 shadow-2xl">
          <CardHeader className="border-b border-gray-700/50 pb-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white text-xl font-semibold mb-2">Upload Image</CardTitle>
                <CardDescription className="text-gray-400">
                  Upload an image or take a photo with your camera for AI analysis
                </CardDescription>
              </div>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <Upload className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 justify-center">
              <Button
                variant="outline"
                className="bg-gray-800/50 border-gray-600/50 hover:bg-gray-700/50 text-gray-200 px-6 py-3 rounded-md transition-all duration-200"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Image
              </Button>

              {!isCameraActive ? (
                <Button
                  variant="outline"
                  className="bg-gray-800/50 border-gray-600/50 hover:bg-gray-700/50 text-gray-200 px-6 py-3 rounded-md transition-all duration-200"
                  onClick={startCamera}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Use Camera
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  className="bg-red-600/80 hover:bg-red-600 px-6 py-3 rounded-md transition-all duration-200"
                  onClick={stopCamera}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}

              {isCameraActive && (
                <>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-md transition-all duration-200"
                    onClick={capturePhoto}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Take Photo
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-gray-800/50 border-gray-600/50 hover:bg-gray-700/50 text-gray-200 px-6 py-3 rounded-md transition-all duration-200"
                    onClick={switchCamera}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Switch Camera
                  </Button>
                </>
              )}

              <input type="file" accept="image/*" onChange={handleFileUpload} ref={fileInputRef} className="hidden" />
            </div>
          </CardContent>
        </Card>

        {/* Camera view */}
        {isCameraActive && (
          <Card className="bg-gray-900/50 border-gray-700/50 backdrop-blur-sm mb-8 shadow-2xl">
            <CardHeader className="pb-4 border-b border-gray-700/50">
              <CardTitle className="text-white text-lg flex items-center">
                <Camera className="mr-2 w-5 h-5 text-blue-400" />
                {cameraFacingMode === "user" ? "Front Camera" : "Back Camera"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-4">
              <div className="relative w-full mx-4 mb-4">
                <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded-lg" />
                
                {/* Camera overlay elements */}
                <div className="absolute top-4 left-4 flex items-center bg-black/40 backdrop-blur-md rounded-full px-3 py-1 text-xs text-green-400 border border-green-500/30">
                  <div className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></div>
                  LIVE
                </div>

                <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md rounded-full px-3 py-1 text-xs text-gray-300 border border-gray-500/30">
                  AUTO-FOCUS
                </div>

                {/* Corner brackets */}
                <div className="absolute top-2 left-2 w-12 h-12 border-t-2 border-l-2 border-blue-400/70"></div>
                <div className="absolute top-2 right-2 w-12 h-12 border-t-2 border-r-2 border-blue-400/70"></div>
                <div className="absolute bottom-2 left-2 w-12 h-12 border-b-2 border-l-2 border-blue-400/70"></div>
                <div className="absolute bottom-2 right-2 w-12 h-12 border-b-2 border-r-2 border-blue-400/70"></div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </CardContent>
          </Card>
        )}

        {/* Image display area */}
        {imageURL && !isCameraActive && (
          <Card className="bg-gray-900/50 border-gray-700/50 backdrop-blur-sm mb-8 shadow-2xl">
            <CardContent className="p-0">
              <div className="relative m-4">
                <img
                  ref={imageRef}
                  src={imageURL || "/placeholder.svg"}
                  alt="Uploaded welding image"
                  className="w-full h-auto rounded-lg"
                  onLoad={handleImageLoad}
                />

                {/* Scanning effect */}
                {(isLoading || scanAnimation) && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-lg">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent opacity-70 animate-scan"></div>
                  </div>
                )}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 backdrop-blur-sm rounded-lg">
                    <div className="relative mb-4">
                      <Loader className="w-10 h-10 text-blue-400 animate-spin" />
                    </div>
                    <div className="text-white text-lg font-medium mb-2">Analyzing image...</div>
                    <div className="text-gray-400 text-sm mb-4">Scanning for defects</div>
                    <div className="w-48 bg-gray-700 rounded-full h-1 overflow-hidden">
                      <div className="h-full bg-blue-400 animate-pulse rounded-full"></div>
                    </div>
                  </div>
                )}

                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-blue-400/50"></div>
                <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-blue-400/50"></div>
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-blue-400/50"></div>
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-blue-400/50"></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error display */}
        {error && (
          <Card className="bg-red-900/20 border-red-700/50 backdrop-blur-sm mb-8 shadow-2xl">
            <CardContent className="p-4 flex items-center">
              <div className="p-2 rounded-full bg-red-500/20 border border-red-500/30 mr-3">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <span className="text-red-200">Error: {error}</span>
            </CardContent>
          </Card>
        )}

        {/* Results display */}
        {!isLoading && imageURL && !isCameraActive && (
          <Card className="bg-gray-900/50 border-gray-700/50 backdrop-blur-sm shadow-2xl">
            <CardHeader className="border-b border-gray-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white text-xl font-semibold mb-2 flex items-center">
                    <Cpu className="mr-2 w-5 h-5 text-blue-400" />
                    Analysis Results
                  </CardTitle>
                  {overallResult && (
                    <Badge
                      className={`${
                        predictions.some((pred) => pred.class.toLowerCase().includes("bad"))
                          ? "bg-red-600/20 border-red-500/50 text-red-200"
                          : "bg-green-600/20 border-green-500/50 text-green-200"
                      } font-medium`}
                    >
                      {overallResult}
                    </Badge>
                  )}
                </div>
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <Scan className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="pt-6">
              {predictions.length > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {predictions.map((pred, index) => {
                      const isBad = pred.class.toLowerCase().includes("bad")
                      return (
                        <div
                          key={index}
                          className={`p-4 rounded-lg flex items-center border transition-all duration-200 hover:bg-opacity-60
                            ${
                              isBad
                                ? "bg-red-900/20 border-red-700/50"
                                : "bg-green-900/20 border-green-700/50"
                            }`}
                        >
                          <div
                            className={`mr-4 p-2 rounded-full border ${
                              isBad 
                                ? "bg-red-500/20 border-red-500/30" 
                                : "bg-green-500/20 border-green-500/30"
                            }`}
                          >
                            {isBad ? (
                              <XCircle className="w-5 h-5 text-red-400" />
                            ) : (
                              <CheckCircle className="w-5 h-5 text-green-400" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-white text-lg mb-1">{pred.class}</div>
                            <div className="text-sm text-gray-400 flex items-center">
                              <span className="mr-2">Confidence:</span>
                              <div className="flex-1 max-w-24 bg-gray-700 rounded-full h-1.5 overflow-hidden mr-2">
                                <div
                                  className={`h-full rounded-full ${isBad ? "bg-red-500" : "bg-green-500"}`}
                                  style={{ width: `${pred.confidence * 100}%` }}
                                ></div>
                              </div>
                              <span className="text-white font-medium">{(pred.confidence * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-700/50 border border-gray-600/50 rounded-full mb-4">
                    <Scan className="w-8 h-8 text-gray-400" />
                  </div>
                  <div className="text-white text-lg font-medium mb-2">No defects or welds detected</div>
                  <div className="text-gray-400 text-sm">
                    Try uploading a different image or adjusting the camera angle.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}