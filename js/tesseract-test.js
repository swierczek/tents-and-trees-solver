var worker;

async function onTesseractReady() {
    worker = await Tesseract.createWorker('eng', 1, {
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: 8, // PSM_SINGLE_WORD
    });

    console.log(worker);
};
