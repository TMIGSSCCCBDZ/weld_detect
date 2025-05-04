// File: app/api/predict/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get the FormData from the incoming request
    const formData = await request.formData();
    
    // Forward the request to the actual API
    const response = await fetch('https://welding-defects-production.up.railway.app/predict', {
      method: 'POST',
      body: formData,
    });
    
    // Check if the response is ok
    if (!response.ok) {
      return NextResponse.json(
        { error: `API responded with status: ${response.status}` },
        { status: response.status }
      );
    }
    
    // Parse and return the response data
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error('Error in API route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}