let imgElement = document.getElementById('imageSrc');

// let imgElement = document.getElementById('imageSrc');
// let inputElement = document.getElementById('fileInput');

// inputElement.addEventListener('change', (e) => {
    // imgElement.src = URL.createObjectURL(e.target.files[0]);
// }, false);

// imgElement.onload = function() {
//     let mat = cv.imread(imgElement);
//     cv.imshow('canvasOutput', mat);
//     mat.delete();
// };

let grid = [];
let verticalLines = [];
let horizontalLines = [];
let gridTop = 0;
let gridLeft = 0;
let gridBottom = 0;
let gridRight = 0;

let bwThreshold = 0;
let houghThreshold = 0;
let processingDepth = 0;

let ocr = true;

let statuses = [];

let completedOCRCount = 0;

var worker;

var onTesseractReady = function() {
    (async () => {
        // worker = await Tesseract.createWorker('eng');
        // const { data: { text } } = await worker.recognize('https://tesseract.projectnaptha.com/img/eng_bw.png');
        // console.log(text);
        // await worker.terminate();

        worker = await Tesseract.createWorker('eng', 1, {
            tessedit_char_whitelist: '0123456789',
            tessedit_pageseg_mode: 8, // PSM_SINGLE_WORD
            logger: m => console.log('tesseract logger', m)
            // langPath: https://tessdata.projectnaptha.com/4.0.0_fast // for speed over accuracy
        });

        console.log(worker);
    })();
}

var onOpenCvReady = function() {
    updateStatus('OpenCV.js is ready');

    let placeholders = document.querySelectorAll('.placeholder img');
    placeholders.forEach(function(item, index) {
        item.addEventListener('click', function(e) {
            updateStatus('');
            // updateStatus('New image clicked...');

            let active = document.querySelector('.placeholder img.active');
            if (active) {
                active.classList.remove('active');
            }

            item.classList.add('active');

            imgElement.src = item.src;
            processImage();
        });
    });

    let activeImage = document.querySelector('.placeholder img.active');

    imgElement.src = activeImage.src;

    initSlider('bwThreshold', 56);
    initSlider('houghThreshold', 95);

    let depthSlider = document.querySelector('#depth');
    if (depthSlider) {
        depthSlider.value = 3; // reset it on page load (show the grid)
        processingDepth = parseInt(depthSlider.value);
        depthSlider.addEventListener('input', function(e) {
            event.target.previousElementSibling.innerText = event.target.value;
            processingDepth = parseInt(this.value);
            processImage();
        });
    }

    let largeCells = document.querySelector('#large-cells');
    if (largeCells) {
        largeCells.addEventListener('click', function(e) {
            bwThreshold = 56;
            bwSlider = document.querySelector('#bwThreshold');
            bwSlider.value = bwThreshold;
            bwSlider.closest('label').querySelector('span').innerText = bwThreshold;

            houghThreshold = 74;
            houghSlider = document.querySelector('#houghThreshold');
            houghSlider.value = houghThreshold;
            houghSlider.closest('label').querySelector('span').innerText = houghThreshold;

            updateStatus('');
            processImage();
        });
    }

    let smallCells = document.querySelector('#small-cells');
    if (smallCells) {
        smallCells.addEventListener('click', function(e) {
            bwThreshold = 46;
            bwSlider = document.querySelector('#bwThreshold');
            bwSlider.value = bwThreshold;
            bwSlider.closest('label').querySelector('span').innerText = bwThreshold;

            houghThreshold = 87;
            houghSlider = document.querySelector('#houghThreshold');
            houghSlider.value = houghThreshold;
            houghSlider.closest('label').querySelector('span').innerText = houghThreshold;

            updateStatus('');
            processImage();
        });
    }

    let solveIt = document.querySelector('#solve-it');
    if (solveIt) {
        solveIt.addEventListener('click', function(e) {
            if (processingDepth != 4) {
                // set processingDepth to 4 so the grid detection fully runs
                let depthSlider = document.querySelector('#depth');
                depthSlider.value = 4;
                depthSlider.dispatchEvent(new Event("input"));
            }

            let src = cv.imread('canvasOutput');
            runOcr(src);
        })
    }

    processImage();
}

function initSlider(id, initVal) {
    let slider = document.querySelector('#'+id);
    if (slider) {
        slider.value = initVal; // page load default
        slider.addEventListener('input', function(e) {
            event.target.previousElementSibling.innerText = event.target.value;

            let value = parseInt(this.value);

            if (id == 'bwThreshold') {
                bwThreshold = value;
            } else if (id == 'houghThreshold') {
                houghThreshold = value;

            }
            processImage();
        });
        slider.dispatchEvent(new Event("input"));
    }
}


var processImage = function() {
    // updateStatus('Processing image...');

    grid = [];
    verticalLines = [];
    horizontalLines = [];
    completedOCRCount = 0;

    let form = document.querySelector('form');

    let src = cv.imread(imgElement);

    let textarea = document.querySelector('#puzzleInput');
    textarea.setAttribute('style', 'display:none');
    textarea.value = '';

    let output = document.querySelector('#puzzleSolution');
    output.innerText = '';

    let ocrPlaceholders = document.querySelectorAll('.ocr-placeholder');
    ocrPlaceholders.forEach((canvas) => {
        canvas.remove();
    });

    // updateStatus('Cropping grid...');
    src = cropGrid(src);

    // updateStatus('Detecting cells...');
    src = detectGrid(src);

    cv.imshow('canvasOutput', src);

    src.delete();
};

function imageMetadata(src) {
    console.log('image width: ' + src.cols + '\n' +
     'image height: ' + src.rows + '\n' +
     'image size: ' + src.size().width + '*' + src.size().height + '\n' +
     'image depth: ' + src.depth() + '\n' +
     'image channels ' + src.channels() + '\n' +
     'image type: ' + src.type() + '\n');
}

/**
 * Crop out the background of the image
 *
 * @param src full color image
 * @return src full color image cropped
 */
function cropGrid(src) {
    // remove the top 15%
    src = removeTop(src);

    // to find contours, background should be black
    let bw = blackAndWhite(src, 50);

    // start in the middle and work outwards from there
    let topCrop = bw.size().height / 2;
    let bottomCrop = bw.size().height / 2;
    let leftCrop = bw.size().width / 2;
    let rightCrop = bw.size().width / 2;

    let contours = findContours(bw);

    // find all of the bounding rectangles to find where objects are
    for (let i = 0; i < contours.size(); ++i) {
        let rect = cv.boundingRect(contours.get(i));

        if (rect.y + rect.height > bottomCrop) {
            bottomCrop = rect.y + rect.height;
        }
        if (rect.y < topCrop) {
            topCrop = rect.y;
        }

        if (rect.x + rect.width > rightCrop) {
            rightCrop = rect.x + rect.width;
        }
        if (rect.x < leftCrop) {
            leftCrop = rect.x;
        }
    }

    // essentially the width of a grid line
    let padding = 2;

    let rect = new cv.Rect(
        leftCrop - padding,
        topCrop - padding,
        rightCrop - leftCrop + padding,
        bottomCrop - topCrop + padding
    );

    contours.delete();

    return src.roi(rect);
}

function findContours(src) {
    // https://docs.opencv.org/3.4/d5/daa/tutorial_js_contours_begin.html
    let contours = new cv.MatVector();
    // https://docs.opencv.org/3.4/d3/dc0/group__imgproc__shape.html#ga819779b9857cc2f8601e6526a3a5bc71
    cv.findContours(src, contours, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    return contours;
}

/**
 * remove the top 15% of the image
 * @param src full color image
 * @return cropped full color image
 */
function removeTop(src) {
    // x, y, width, height
    let rect = new cv.Rect(
        0,
        (src.size().height / 100) * 15,
        src.size().width,
        (src.size().height / 100) * 85
    );
    return src.roi(rect);
}

/**
 * Convert the src to black and white
 *
 * @param src full color image
 * @param threshold value for conversion function
 * @param blackBg white on black (default) or black on white
 * @return binary black/white image
 */
function blackAndWhite(src, threshold, blackBg = true) {
    let bw = new cv.Mat();

    // grayscale it for easier detection
    cv.cvtColor(src, bw, cv.COLOR_RGBA2GRAY, 0);

    // https://docs.opencv.org/3.4/d7/dd0/tutorial_js_thresholding.html
    // https://docs.opencv.org/3.4/d7/d1b/group__imgproc__misc.html#gae8a4a146d1ca78c626a53577199e9c57
    let mode = blackBg ? cv.THRESH_BINARY : cv.THRESH_BINARY_INV;
    cv.threshold(bw, bw, threshold, 255, mode);

    return bw
}

/**
 * Find all grid lines, then cells to determine tree vs empty,
 * then all column/row numbers and pass them to Tesseract to
 * generate the full text output of the grid
 *
 * @param src full color image
 */
function detectGrid(src) {
    let src2 = src.clone();
    let bw = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
    // 56 works for up to 17x17
    bw = blackAndWhite(src, bwThreshold);
    // console.log('bwThreshold', bwThreshold);

    if (processingDepth === 0) {
        return bw;
    }

    // https://docs.opencv.org/3.4/d7/de1/tutorial_js_canny.html
    let edges = new cv.Mat();
    // the thresholds here don't really seem to matter much at all
    cv.Canny(bw, edges, 50, 100, apertureSize = 3);

    if (processingDepth === 1) {
        return edges;
    }

    // dilate/dissolve to make the lines more prominent
    // https://docs.opencv.org/3.4/d4/d76/tutorial_js_morphological_ops.html
    let M2 = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, M2);

    if (processingDepth === 2) {
        return edges;
    }

    // https://docs.opencv.org/3.4/d3/de6/tutorial_js_houghlines.html
    let lines = new cv.Mat();
    // works well up to 10x10
    // threshold of 120 misses a couple
    // 95 gets others, but it seems like this might need to be dynamic :/

    // console.log('houghThreshold', houghThreshold);
    //
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, houghThreshold, minLength = 450, maxGap = 300);
    // TODO: find params that work for 13+
    // cv.HoughLinesP(edges, lines, 1, Math.PI / 180, threshold = 120, minLength = 450, maxGap = 300);
    // cv.HoughLines(src, lines, 100, Math.PI / 180, 30, 0, 0, 0, Math.PI);
    // cv.HoughLines(src, lines, 1, Math.PI / 180, 30, 0, 0, Math.PI / 4, Math.PI / 2);

    // console.log('lines', lines.rows);

    // determine lines
    // start with a line on the right
    verticalLines = [src.size().width-1];
    // start with a line on the bottom
    horizontalLines = [src.size().height-1];

    for (let i = 0; i < lines.rows; i++) {
        let x1 = lines.data32S[i * 4];
        let y1 = lines.data32S[i * 4 + 1];

        let x2 = lines.data32S[i * 4 + 2];
        let y2 = lines.data32S[i * 4 + 3];

        // only track horizontal/vertical lines
        if (x1 === x2) {
            verticalLines.push(x1);
        } else if (y1 === y2) {
            horizontalLines.push(y1);
        }
    }

    // then filter out any similar lines i.e. x values within some value
    verticalLines.forEach(function(item, index) {
        verticalLines.forEach(function(item2, index2) {
            if (index !== index2 && Math.abs(item2 - item) < 10) {
                delete verticalLines[index2];
            }
        });
    });
    horizontalLines.forEach(function(item, index) {
        horizontalLines.forEach(function(item2, index2) {
            if (index !== index2 && Math.abs(item2 - item) < 10) {
                delete horizontalLines[index2];
            }
        });
    });

    verticalLines = removeOutliers(verticalLines);
    horizontalLines = removeOutliers(horizontalLines);

    // console.log('verticalLines', verticalLines);
    // console.log('horizontalLines', horizontalLines);

    gridTop = Math.min(...horizontalLines);
    gridLeft = Math.min(...verticalLines);
    gridBottom = Math.max(...horizontalLines);
    gridRight = Math.max(...verticalLines);

    // then draw the lines as a gut check
    verticalLines.forEach(function(item, index) {
        let startPoint = new cv.Point(item, gridTop);
        let endPoint = new cv.Point(item, gridBottom);

        cv.line(src, startPoint, endPoint, new cv.Scalar(255, 255, 255, 255), 3);
    });
    horizontalLines.forEach(function(item, index) {
        let startPoint = new cv.Point(gridLeft, item);
        let endPoint = new cv.Point(gridRight, item);

        cv.line(src, startPoint, endPoint, new cv.Scalar(255, 255, 255, 255), 3);
    });

    let vGaps = getGaps(verticalLines);
    let hGaps = getGaps(horizontalLines);

    let vStdDev = getStandardDeviation(vGaps);
    let hStdDev = getStandardDeviation(hGaps);

    // console.log('vsd', vStdDev);
    // console.log('hsd', hStdDev);

    updateStatus('Grid appears to be ' + (verticalLines.length-1) + 'x' + (horizontalLines.length-1));
    if (
        verticalLines.length-1 < 5 || horizontalLines.length-1 < 5
        || vStdDev > 10 || hStdDev > 10
    ) {
        updateStatus('This might not be right or as accurate as it could be. Click the relevant size button to reprocess with different parameters.');
    }

    if (processingDepth === 3) {
        return src;
    }

    // now iterate over the lines to detect the cells
    for(y=0; y<horizontalLines.length-1; y++) {
        let row = [];
        let y1 = horizontalLines[y];
        let y2 = horizontalLines[y+1];

        for(x=0; x<verticalLines.length-1; x++) {
            let x1 = verticalLines[x];
            let x2 = verticalLines[x+1];

            // full cell
            let point1 = new cv.Point(x1, y1);
            let point2 = new cv.Point(x2, y2);
            // cv.rectangle(src, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

            // middle 2/3 to account for drift or carryover treetops
            let scale = .33;
            let innerWidth = Math.floor((x2 - x1) * scale);
            let innerHeight = Math.floor((y2 - y1) * scale);

            let point3 = new cv.Point(point1.x + innerWidth, point1.y + innerHeight);
            let point4 = new cv.Point(point2.x - innerWidth, point2.y - innerHeight);
            // let rectangleColor = new cv.Scalar(0, 255, 255, 255);
            // cv.rectangle(src, point3, point4, rectangleColor, 2, cv.LINE_AA, 0);

            let innerRect = new cv.Rect(
                point3.x,
                point3.y,
                point4.x - point3.x,
                point4.y - point3.y
            );

            let cell = src2.roi(innerRect);
            cell = blackAndWhite(cell, 120);

            // don't need to check every pixel...
            let avgColor = 0;
            let count = 0;
            for (let i = 0; i < cell.size().width; i+=5) {
                for (let j = 0; j < cell.size().height; j+=3) {
                    avgColor += parseInt(cell.ucharPtr(i, j));
                    count++;
                }
            }

            avgColor = avgColor / count;
            if (avgColor > 100) {
                row.push('x');
                let rectangleColor = new cv.Scalar(255, 0, 0, 255);
                cv.rectangle(src, point3, point4, rectangleColor, 2, cv.LINE_AA, 0);
            } else {
                row.push('.');
                let rectangleColor = new cv.Scalar(0, 255, 0, 255);
                cv.rectangle(src, point3, point4, rectangleColor, 2, cv.LINE_AA, 0);
            }
        }

        grid.push(row.join(''));
    }

    console.log('grid here', grid);

    return src;
}

function getGaps(lines) {
    let gaps = [];

    for(let i=0; i<lines.length-1; i++) {
        gaps.push(Math.abs(lines[i] - lines[i+1]));
    }

    return gaps;
}

function runOcr(src) {
    let results = [];

    let ocrCount = (verticalLines.length - 1) + (horizontalLines.length - 1);

    updateStatus('Running OCR on ' + ocrCount + ' cells...');

    // top row of numbers
    for (let x = 0; x < verticalLines.length-1; x++) {
        let numRect = new cv.Rect(
            verticalLines[x],
            0,
            verticalLines[x+1] - verticalLines[x],
            gridTop
        );

        // draw rectangle around number for debugging purposes
        // drawRectangle(src, numRect)

        let cell = src.roi(numRect);
        // for OCR we want white bg
        cell = blackAndWhite(cell, 50, false);

        let result = getResult(cell, 'col-' + x);
        // console.log('top-result', result);
        results.push(result);
    }

    // left column of numbers
    for (let y = 0; y < horizontalLines.length-1; y++) {
        let numRect = new cv.Rect(
            0,
            horizontalLines[y],
            gridLeft,
            horizontalLines[y+1] - horizontalLines[y]
        );

        // draw rectangle around number for debugging purposes
        // drawRectangle(src, numRect)

        let cell = src.roi(numRect);
        // for OCR we want white bg
        cell = blackAndWhite(cell, 50, false);

        let result = getResult(cell, 'row-' + y);
        // console.log('left-result', result);
        results.push(result);
    }

    console.log('results', results);

    /**
     * Split the results into separate cols/rows and pass to print function
     */
    Promise.all(results).then((numbers) => {
        let colNums = [];
        let rowNums = [];

        numbers.forEach((number) => {
            if (number.id.indexOf('col') === 0) {
                colNums.push(number.text);
            } else {
                rowNums.push(number.text);
            }
        });

        updateStatus('Printing grid...');
        printInput(colNums, rowNums, grid);
    });
}

function drawRectangle(src, rect, color) {
    let point1 = new cv.Point(rect.x, rect.y);
    let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);

    if (typeof color === 'undefined') {
        color = new cv.Scalar(255, 0, 0, 255);
    }

    cv.rectangle(src, point1, point2, color, 2, cv.LINE_AA, 0);
}

/**
 * Check the # cell and determine if it contains a number or not.
 * If it contains a number, send it to OCR, otherwise consider it "?"
 *
 * @param cell Black and white image of a single cell
 * @param id Unique ID for the Canvas or Promise
 */
function getResult(cell, id) {
    // Trim out 70% from all edges and then check if all pixels are black.
    // If so, we can skip findText because it should be "?".
    // Smaller values than this may create false-negatives because it could select only the empty center of 0.
    // @todo: a bettter way would be to find the contours, then determine if any contours pass
    //        through the ~center (or a 20% wide center area or something)
    let percent = .3;
    let centerRect = new cv.Rect(
        cell.size().width * percent,
        cell.size().height * percent,
        cell.size().width * (1 - (percent * 2)), // *2 because we need to trim both the left and right
        cell.size().height * (1 - (percent * 2)),
    );

    let center = cell.roi(centerRect);

    // display this in a new canvas for debugging
    let tempId = 'center-' + id;
    let canvas = document.createElement('canvas');
    canvas.setAttribute('class', 'center-placeholder');
    canvas.setAttribute('id', tempId);
    document.querySelector('body').append(canvas);
    cv.imshow(tempId, center);

    let colorSum = 0;
    for (let i = 0; i < center.size().width; i++) {
        for (let j = 0; j < center.size().height; j++) {
            let filledPixel = parseInt(center.ucharPtr(i, j)[0]) < 255;
            // console.log('pixel', pixel);

            if (filledPixel) {
                colorSum++;
            }
        }
    }

    if (colorSum === 0) {
        // console.log('skipping OCR for ' + id);
        // don't bother sending to OCR!
        let thenable = {
          then(onFulfilled, onRejected) {
            onFulfilled({
              // The thenable is fulfilled with another thenable
              then(onFulfilled, onRejected) {
                completedOCRCount++;
                updateStatus('Single OCR number complete: ' + completedOCRCount);

                onFulfilled({
                    id: id,
                    text: '?'
                });
              },
            });
          },
        };

        return Promise.resolve(thenable);
    } else {
        // tesseract it!
        // console.log('cell', cell);
        // console.log('id', id);
        console.log('findText', id);
        return findText(cell, id);
    }
}

function displaySolutionGrid(results) {
    let src = cv.imread(document.querySelector('#canvasOutput'));

    let tentImg = cv.imread(document.querySelector('#tent'));

    // manually overlay each tent image over the src
    results.forEach(function(item, index) {
        let x = parseInt(item.x);
        let y = parseInt(item.y);

        // resize the tent image
        // https://docs.opencv.org/3.4/dd/d52/tutorial_js_geometric_transformations.html
        let tentCopy = tentImg.clone();
        let tentRect = new cv.Rect(
            verticalLines[x],
            horizontalLines[y],
            verticalLines[x+1] - verticalLines[x],
            horizontalLines[y+1] - horizontalLines[y]
        );

        let dsize = new cv.Size(tentRect.width, tentRect.height);
        cv.resize(tentCopy, tentCopy, dsize, 0, 0, cv.INTER_AREA);

        // https://docs.opencv.org/3.4/dd/d4d/tutorial_js_image_arithmetics.html
        for(i=0; i<tentCopy.size().height; i++) {
            for(j=0; j<tentCopy.size().width; j++) {
                src.ucharPtr(i + horizontalLines[y], j + verticalLines[x])[0] = tentCopy.ucharPtr(i, j)[0]; // R
                src.ucharPtr(i + horizontalLines[y], j + verticalLines[x])[1] = tentCopy.ucharPtr(i, j)[1]; // G
                src.ucharPtr(i + horizontalLines[y], j + verticalLines[x])[2] = tentCopy.ucharPtr(i, j)[2]; // B
            }
        }

        tentCopy.delete();

        // alternate attempt below (blend instead of overwriting individual pixels)

        // add padding to make the tent image the same size as src
        // https://docs.opencv.org/3.4/de/d06/tutorial_js_basic_ops.html
        // let size = [
        //     horizontalLines[y], // top
        //     src.size().height - horizontalLines[y+1], // bottom
        //     verticalLines[x], // left
        //     src.size().width - verticalLines[x+1], // right
        // ];
        // cv.copyMakeBorder(imgSrc2, imgSrc2, ...size, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));

        // https://docs.opencv.org/3.4/d5/df3/tutorial_js_trackbar.html
        // cv.addWeighted( imgSrc2, .5, src, .5, 0.0, src, -1);

    });

    cv.imshow('canvasOutput', src);

    src.delete();
    tentImg.delete();
}

function removeOutliers(lines) {
    lines = lines.filter(e=>e);
    lines.sort(function(a, b) {
        return a - b;
    });
    lines = lines.reverse();

    // sorted biggest to smallest
    // console.log('sorted', lines);

    // the first 3 will give us a good sense of distance
    let averageDistance = 0;
    for(let i=0; i<3; i++) {
        averageDistance += Math.abs(lines[i] - lines[i+1]);
    }
    averageDistance = averageDistance / 3;

    // console.log('average', averageDistance);

    for(var i = lines.length - 1; i >= 0; i--) {
        let diff = Math.abs(lines[i] - lines[i-1]);

        // console.log('diff', diff);
        // console.log('avgMin', averageDistance * .8);
        // console.log('avgMax', averageDistance * 1.2);

        // account for a 20% difference in either direction
        if (diff < (averageDistance * .8)) {
            // remove this item
            lines.splice(i, 1);
            // console.log('spliced lines', lines);
            // loop using this line again
            i++;
        }
    }

    // return smallest to biggest
    lines = lines.reverse();

    // check if there are any gaps larger than avg * 1.7, and if so, add a line
    // this is a quick fix for lower resolution images that might have very thin lines,
    // so some get missed with the normal grid detection logic
    for (let i = 0; i < lines.length-1; i++) {
        let diff = Math.abs(lines[i] - lines[i+1]);

        if (diff > averageDistance * 1.7) {
            // add line at this coordinate
            let newLine = Math.round(lines[i] + averageDistance);
            lines.splice(i, 0, newLine);
            // go to the next item
            i++;
        }
    }

    // console.log('lines', lines);

    return lines;
}

/**
 * OCR to determine which digit(s) are in the image
 *
 * @param src black and white image of a number
 * @param id for the canvas
 */
async function findText(src, id) {
    let canvas = document.createElement('canvas');
    canvas.setAttribute('class', 'ocr-placeholder');
    canvas.setAttribute('id', id);

    document.querySelector('body').append(canvas);

    cv.imshow(id, src);

    // console.log('creating worker');

    try {
        // configure the OCR worker
        // https://github.com/naptha/tesseract.js/blob/HEAD/docs/api.md#create-worker
        // const { createWorker } = Tesseract;
        // const worker = await Tesseract.createWorker('eng', 1, {
        //     tessedit_char_whitelist: '0123456789',
        //     tessedit_pageseg_mode: 8, // PSM_SINGLE_WORD
        //     logger: m => console.log('tesseract logger', m)
        //     // langPath: https://tessdata.projectnaptha.com/4.0.0_fast // for speed over accuracy
        // });

        // await worker.terminate(); // maybe?

        // console.log('creating worker');
        // console.log('confirming worker', worker);

        // return the promise
        return await worker.recognize(document.getElementById(id))
            .then(function(result) {
                console.log('result', result);
                completedOCRCount++;
                updateStatus('Single OCR number complete: ' + completedOCRCount);

                // if it's empty, return '?'
                let number = parseInt(result.data.text);
                if (isNaN(number)) {
                    number = '?';
                }

                console.log('returning');

                return {
                    id: id,
                    text: number
                }
            })
            .catch((err) => {
                console.log('tesseract error', err);
            })
            .finally(() => {
                console.log('Tesseract completed');
            });
    } catch (error) {
        console.log('error', error);
    }
}

// blur to help with edge detection and combat image compression?
// cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
// cv.bilateralFilter(src, dst, 9, 75, 75, cv.BORDER_DEFAULT);

// maybe also use erosion + dilation = opening to remove noise (only with a binary image)?

// pyramids to find/match an object in the image? Not sure if that's useful yet or not

/**
 * Output the full grid data to a textarea
 */
function printInput(cols, rows, grid) {
    let textarea = document.querySelector('#puzzleInput');
    textarea.setAttribute('rows', rows.length+1);
    textarea.setAttribute('cols', cols.length+5);
    textarea.setAttribute('style', 'display:block');

    console.log('rows', rows);
    console.log('cols', cols);
    console.log('grid', grid);

    let input = ' ' + cols.join('') + "\n";
    for (y=0; y < rows.length; y++) {
        input += rows[y] + grid[y] + "\n";
    }
    textarea.value = input;

    updateStatus('Sending to solver...');
    let form = document.querySelector('form');

    fetch(
        form.action,
        {
            method:'post',
            body: new FormData(form)
        }
    ).then((response) => {
        return response.json();
    }).then((response) => {
        // console.log('response', response);

        updateStatus('Complete!');
        updateStatus(response.success ? 'Solved!' : 'Not solved :(');
        document.querySelector('#puzzleSolution').innerHTML = JSON.stringify(response.tents);

        updateStatus('Displaying results...');
        displaySolutionGrid(response.tents);
    });
}

function updateStatus(status) {
    if (status == '') {
        statuses = [];
    } else {
        statuses.push(status);
    }

    document.getElementById('status').innerHTML = statuses.join('<br>');
}

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
    var timeout;
    return function() {
        var context = this, args = arguments;
        var later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};

function getStandardDeviation(array) {
  const n = array.length
  const mean = array.reduce((a, b) => a + b) / n
  return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n)
}
