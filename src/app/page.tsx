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
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900 via-blue-950 to-black text-white p-4 md:p-8 overflow-hidden">
      {/* Decorative elements */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzPjxwYXR0ZXJuIGlkPSJncmlkIiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjxwYXRoIGQ9Ik0gNDAgMCBMIDAgMCAwIDQwIiBmaWxsPSJub25lIiBzdHJva2U9IiMwMzY5ZTEiIHN0cm9rZS13aWR0aD0iMC41Ii8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIiBvcGFjaXR5PSIwLjA1Ii8+PC9zdmc+')]"></div>
        <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(29,78,216,0.15)_0%,transparent_60%)]"></div>
        <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-[radial-gradient(circle,rgba(6,182,212,0.15)_0%,transparent_60%)]"></div>
        <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-[radial-gradient(circle,rgba(59,130,246,0.1)_0%,transparent_60%)]"></div>
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        <header className="mb-12 text-center relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent blur-sm"></div>
          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 mb-2 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]">
            DEFEX<span className="text-white px-1">•</span>SCAN
          </h1>
          <p className="text-blue-300 max-w-2xl mx-auto text-lg">
            <span className="text-cyan-400 font-semibold">Advanced AI</span> welding defect detection system
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Badge className="bg-blue-900/50 text-blue-300 border border-blue-500/50 px-3 backdrop-blur-sm">
              <Cpu className="w-3 h-3 mr-1" /> AI Powered
            </Badge>
            <Badge className="bg-blue-900/50 text-blue-300 border border-blue-500/50 px-3 backdrop-blur-sm">
              <Scan className="w-3 h-3 mr-1" /> Real-time Analysis
            </Badge>
            <Badge className="bg-blue-900/50 text-blue-300 border border-blue-500/50 px-3 backdrop-blur-sm">
              <Shield className="w-3 h-3 mr-1" /> High Precision
            </Badge>
          </div>
        </header>

        <Card className="bg-blue-950/30 border-blue-700/30 backdrop-blur-md mb-8 shadow-[0_0_15px_rgba(37,99,235,0.3)] overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-blue-900/20 pointer-events-none"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>

          <CardHeader className="border-b border-blue-800/30">
            <CardTitle className="text-blue-100 flex items-center">
              <div className="mr-2 p-1 rounded-full bg-blue-900/50 border border-blue-700/50">
                <Zap className="w-4 h-4 text-cyan-400" />
              </div>
              Image Input
            </CardTitle>
            <CardDescription className="text-blue-300">
              Upload an image or take a photo with your camera
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 justify-center">
              <Button
                variant="outline"
                className="bg-blue-900/40 border-blue-600/50 hover:bg-blue-800/60 text-blue-100 shadow-[0_0_10px_rgba(37,99,235,0.3)] transition-all duration-300 hover:shadow-[0_0_15px_rgba(37,99,235,0.5)]"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Image
              </Button>

              {!isCameraActive ? (
                <Button
                  variant="outline"
                  className="bg-blue-900/40 border-blue-600/50 hover:bg-blue-800/60 text-blue-100 shadow-[0_0_10px_rgba(37,99,235,0.3)] transition-all duration-300 hover:shadow-[0_0_15px_rgba(37,99,235,0.5)]"
                  onClick={startCamera}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Use Camera
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  className="shadow-[0_0_10px_rgba(239,68,68,0.3)] transition-all duration-300 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                  onClick={stopCamera}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}

              {isCameraActive && (
                <>
                  <Button
                    variant="default"
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-[0_0_10px_rgba(8,145,178,0.5)] transition-all duration-300 hover:shadow-[0_0_15px_rgba(8,145,178,0.7)]"
                    onClick={capturePhoto}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Take Photo
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-blue-900/40 border-blue-600/50 hover:bg-blue-800/60 text-blue-100 shadow-[0_0_10px_rgba(37,99,235,0.3)] transition-all duration-300 hover:shadow-[0_0_15px_rgba(37,99,235,0.5)]"
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
          <Card className="bg-blue-950/30 border-blue-700/30 backdrop-blur-md mb-8 shadow-[0_0_15px_rgba(37,99,235,0.3)] overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-blue-900/20 pointer-events-none"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>

            <CardHeader className="pb-0 border-b border-blue-800/30">
              <CardTitle className="text-blue-100 text-sm flex items-center">
                <div className="mr-2 p-1 rounded-full bg-blue-900/50 border border-blue-700/50">
                  <Camera className="w-3 h-3 text-cyan-400" />
                </div>
                {cameraFacingMode === "user" ? "Front Camera" : "Back Camera"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-4">
              <div className="relative w-full">
                <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded-md" />
                <div className="absolute inset-0 border-2 border-cyan-400/50 pointer-events-none rounded-md shadow-[0_0_20px_rgba(34,211,238,0.3)]"></div>

                {/* Camera HUD elements */}
                <div className="absolute top-4 left-4 flex items-center bg-black/30 backdrop-blur-md rounded-full px-2 py-1 text-xs text-cyan-300 border border-cyan-500/30">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 mr-2 animate-pulse"></div>
                  LIVE
                </div>

                <div className="absolute bottom-4 right-4 bg-black/30 backdrop-blur-md rounded-full px-2 py-1 text-xs text-cyan-300 border border-cyan-500/30">
                  AUTO-FOCUS
                </div>

                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-cyan-400/70 rounded-tl-md"></div>
                <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-cyan-400/70 rounded-tr-md"></div>
                <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-cyan-400/70 rounded-bl-md"></div>
                <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-cyan-400/70 rounded-br-md"></div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </CardContent>
          </Card>
        )}

        {/* Image display area */}
        {imageURL && !isCameraActive && (
          <Card className="bg-blue-950/30 border-blue-700/30 backdrop-blur-md mb-8 shadow-[0_0_15px_rgba(37,99,235,0.3)] overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-blue-900/20 pointer-events-none"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>

            <CardContent className="p-0">
              <div className="relative">
                <img
                  ref={imageRef}
                  src={imageURL || "/placeholder.svg"}
                  alt="Uploaded welding image"
                  className="w-full h-auto rounded-md"
                  onLoad={handleImageLoad}
                />
                {/* {renderBoxes()} */}

                {/* Scanning effect */}
                {(isLoading || scanAnimation) && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-b from-cyan-400 to-transparent opacity-70 animate-scan"></div>
                  </div>
                )}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-950/80 backdrop-blur-sm">
                    <div className="relative">
                      <Loader className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
                      <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-cyan-400/20 blur-md"></div>
                    </div>
                    <div className="text-cyan-200 text-lg font-semibold mb-2">Analyzing image...</div>
                    <div className="text-cyan-300/70 text-sm mb-4">Scanning for defects</div>
                    <div className="w-64 bg-blue-900/50 rounded-full h-2 overflow-hidden border border-blue-700/50">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 animate-progress rounded-full"></div>
                    </div>
                  </div>
                )}

                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-cyan-400/70 rounded-tl-md"></div>
                <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-cyan-400/70 rounded-tr-md"></div>
                <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-cyan-400/70 rounded-bl-md"></div>
                <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-cyan-400/70 rounded-br-md"></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error display */}
        {error && (
          <Card className="bg-red-950/30 border-red-700/30 backdrop-blur-md mb-8 shadow-[0_0_15px_rgba(239,68,68,0.3)] overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-400 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-400 to-transparent"></div>

            <CardContent className="p-4 flex items-center">
              <div className="p-2 rounded-full bg-red-900/50 border border-red-700/50 mr-3">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <span>Error: {error}</span>
            </CardContent>
          </Card>
        )}

        {/* Results display */}
        {!isLoading && imageURL && !isCameraActive && (
          <Card className="bg-blue-950/30 border-blue-700/30 backdrop-blur-md shadow-[0_0_15px_rgba(37,99,235,0.3)] overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-blue-900/20 pointer-events-none"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>

            <CardHeader className="border-b border-blue-800/30">
              <CardTitle className="text-blue-100 flex items-center">
                <div className="mr-2 p-1 rounded-full bg-blue-900/50 border border-blue-700/50">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                </div>
                Analysis Results
                {overallResult && (
                  <Badge
                    className={`ml-4 ${
                      overallResult.includes("Defects")
                        ? "bg-gradient-to-r from-red-700 to-red-600 border border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                        : "bg-gradient-to-r from-green-700 to-green-600 border border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                    }`}
                  >
                    {overallResult}
                  </Badge>
                )}
              </CardTitle>
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
                          className={`p-4 rounded-lg flex items-center relative overflow-hidden
                            ${
                              isBad
                                ? "bg-red-900/20 border border-red-700/30"
                                : "bg-green-900/20 border border-green-700/30"
                            }`}
                        >
                          <div
                            className={`absolute inset-0 ${isBad ? "bg-red-500/5" : "bg-green-500/5"} backdrop-blur-sm`}
                          ></div>
                          <div
                            className={`absolute top-0 left-0 right-0 h-px ${isBad ? "bg-gradient-to-r from-transparent via-red-400 to-transparent" : "bg-gradient-to-r from-transparent via-green-400 to-transparent"}`}
                          ></div>
                          <div
                            className={`absolute bottom-0 left-0 right-0 h-px ${isBad ? "bg-gradient-to-r from-transparent via-red-400 to-transparent" : "bg-gradient-to-r from-transparent via-green-400 to-transparent"}`}
                          ></div>

                          <div
                            className={`mr-4 p-2 rounded-full ${isBad ? "bg-red-900/50 border border-red-700/50" : "bg-green-900/50 border border-green-700/50"}`}
                          >
                            {isBad ? (
                              <XCircle className="w-6 h-6 text-red-400" />
                            ) : (
                              <CheckCircle className="w-6 h-6 text-green-400" />
                            )}
                          </div>
                          <div className="relative z-10">
                            <div className="font-medium text-lg">{pred.class}</div>
                            <div className="text-sm opacity-80 flex items-center mt-1">
                              <span>Confidence:</span>
                              <div className="ml-2 w-24 bg-blue-900/50 rounded-full h-1.5 overflow-hidden border border-blue-700/50">
                                <div
                                  className={`h-full ${isBad ? "bg-red-500" : "bg-green-500"} rounded-full`}
                                  style={{ width: `${pred.confidence * 100}%` }}
                                ></div>
                              </div>
                              <span className="ml-2">{(pred.confidence * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-700/30 backdrop-blur-sm">
                    <div className="text-sm text-blue-300">
                      <div className="flex items-center mb-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 mr-2"></div>
                        <span className="font-medium">AI Analysis Summary</span>
                      </div>
                      <p>
                        {/* {
                          predictions.length > 1 && predictions.some((pred) => pred.class.toLowerCase().includes("good"))
                            ? `The analysis detected ${predictions.length -1} welding defect(s) in the image.`
                            : "No defects were detected in the analyzed areas."
                          } */}


                         
                     
                        {overallResult && overallResult.includes("Defects")
                          ? " Critical defects have been detected that may compromise structural integrity."
                          : " No critical defects were detected in the analyzed areas."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 relative">
                  <div className="absolute inset-0 bg-blue-500/5 backdrop-blur-sm rounded-lg"></div>
                  <Scan className="w-12 h-12 text-blue-400/50 mx-auto mb-4" />
                  <div className="text-blue-300 text-lg">No defects or welds detected in the image.</div>
                  <div className="text-blue-400/70 text-sm mt-2">
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
