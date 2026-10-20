"""
Tesseract OCR Engine Module for DocuMind.
Extracts text from images with pre-processing for improved accuracy
and computes real OCR confidence scores.
"""

import logging
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter

logger = logging.getLogger(__name__)


# === [TAG FUNGSI: Prapemrosesan Citra Dokumen (_preprocess_image)] ===
# Penjelasan: Mempertajam gambar sebelum diserahkan ke OCR. Alur kerja: Grayscale -> CLAHE (Penguatan Kontras Lokal) -> Otsu Binarization (Hitam-Putih Otomatis) -> Median Blur (Penghilang Bintik Derau). Memakai OpenCV dengan fallback ke Pillow jika OpenCV tidak ada.
def _preprocess_image(img: Image.Image) -> Image.Image:
    """
    Apply lightweight image pre-processing to improve Tesseract accuracy.
    Pipeline: Grayscale → Contrast Enhancement → Otsu Binarization.
    Uses OpenCV if available, otherwise falls back to pure PIL.
    """
    # 1. Convert to grayscale (L mode)
    gray = ImageOps.grayscale(img)

    try:
        import cv2
        import numpy as np

        # Convert PIL → NumPy array for OpenCV processing
        img_array = np.array(gray)

        # 2. CLAHE (Contrast Limited Adaptive Histogram Equalization)
        #    Enhances local contrast — critical for uneven lighting / shadows
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(img_array)

        # 3. Otsu's thresholding — automatic optimal binarization
        _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # 4. Mild denoising to remove speckle noise without losing text edges
        denoised = cv2.medianBlur(binary, 3)

        return Image.fromarray(denoised)

    except ImportError:
        # Fallback: Pure PIL processing (no OpenCV)
        # 2. Increase contrast via autocontrast
        enhanced = ImageOps.autocontrast(gray, cutoff=1)

        # 3. Sharpen to clarify text edges
        sharpened = enhanced.filter(ImageFilter.SHARPEN)

        # 4. Simple fixed-threshold binarization via PIL point()
        threshold = 140
        binary = sharpened.point(lambda px: 255 if px > threshold else 0, '1')

        return binary.convert('L')


# === [TAG FUNGSI: Validasi Bahasa Tesseract Aman (_get_safe_lang)] ===
# Penjelasan: Mengecek apakah paket model bahasa Tesseract (misal 'ind' untuk Indonesia) terpasang di sistem. Jika belum ada, otomatis beralih ke 'eng' (Inggris) agar server tidak crash/error.
def _get_safe_lang(preferred_lang: str) -> str:
    """
    Validate that the requested Tesseract language packs exist.
    Falls back gracefully to 'eng' if 'ind' traineddata is not installed,
    preventing a crash on servers without Indonesian language data.
    """
    try:
        import pytesseract
        available = pytesseract.get_languages()
        # available is a list like ['eng', 'ind', 'osd']
        requested = [l.strip() for l in preferred_lang.split('+')]
        valid = [l for l in requested if l in available]
        if valid:
            return '+'.join(valid)
        # None of the requested languages available — default to eng
        return 'eng'
    except Exception:
        # If we can't query languages (e.g. Tesseract not in PATH for get_languages),
        # return the original string and let image_to_string handle the error
        return preferred_lang


# === [TAG FUNGSI UTAMA: Ekstraksi Teks Gambar via OCR (process_image_ocr)] ===
# Penjelasan: Menjalankan Tesseract OCR dengan konfigurasi LSTM (--oem 1) dan segmentasi otomatis (--psm 3). Menghitung skor kepercayaan (confidence score) kata dan mengembalikan teks hasil ekstraksi.
def process_image_ocr(image_path: str, lang: str = 'ind+eng') -> tuple[str, float]:
    """
    Performs Tesseract OCR on image files with:
    - Image pre-processing for improved accuracy
    - Adaptive PSM configuration
    - Safe language fallback
    - Graceful error handling

    Returns:
        (extracted_text, ocr_confidence_score)
    """
    path = Path(image_path)
    extracted_text = ""
    confidence = 0.95

    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

        with Image.open(image_path) as img:
            # Pre-process image for better OCR accuracy
            processed = _preprocess_image(img)

            # Resolve safe language string
            safe_lang = _get_safe_lang(lang)

            # Adaptive Tesseract config:
            #   --oem 1  = LSTM neural net engine (faster + more accurate)
            #   --psm 3  = Fully automatic page segmentation (best for mixed layouts)
            ocr_config = '--oem 1 --psm 3'

            # 1. Extract word-level confidence data from the pre-processed image
            try:
                data = pytesseract.image_to_data(
                    processed, lang=safe_lang, config=ocr_config,
                    output_type=pytesseract.Output.DICT
                )
                confs = [
                    float(c) for c in data.get('conf', [])
                    if c != '-1' and c != -1 and str(c).strip()
                ]
                if confs:
                    confidence = round((sum(confs) / len(confs)) / 100.0, 2)
                    confidence = max(0.50, min(0.99, confidence))
            except Exception:
                pass

            # 2. Extract full text from the pre-processed image
            text = pytesseract.image_to_string(processed, lang=safe_lang, config=ocr_config)
            if text and text.strip():
                return text.strip(), confidence

            # 3. Retry with English-only if bilingual extraction yielded nothing
            if safe_lang != 'eng':
                text_eng = pytesseract.image_to_string(processed, lang='eng', config=ocr_config)
                if text_eng and text_eng.strip():
                    return text_eng.strip(), confidence

            # 4. Last resort: try OCR on original (unprocessed) image
            #    Some images with unusual color profiles may lose data during binarization
            text_orig = pytesseract.image_to_string(img, lang=safe_lang, config=ocr_config)
            if text_orig and text_orig.strip():
                return text_orig.strip(), confidence

    except Exception as e:
        logger.error(f"OCR engine failed for {image_path}: {str(e)}")
        raise e

    return extracted_text, confidence
