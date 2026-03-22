import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set worker path to local file to avoid CDN issues
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const convertPdfToImage = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    // Get the first page
    const page = await pdf.getPage(1);
    
    // Set scale for better resolution (2.0 is usually good enough for OCR/Vision)
    const viewport = page.getViewport({ scale: 2.0 });
    
    // Create a canvas element
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error("Could not create canvas context");
    }
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Render PDF page into canvas context
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      // @ts-ignore - Some versions of pdfjs-dist require the canvas element
      canvas: canvas
    };
    
    // @ts-ignore
    await page.render(renderContext).promise;
    
    // Convert canvas to base64 JPEG
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (error) {
    console.error("Error converting PDF to image:", error);
    throw new Error("Không thể đọc file PDF. Vui lòng thử lại với file hình ảnh.");
  }
};
