let imgElement = document.getElementById('imageSrc');
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

var onOpenCvReady = function() {
    document.getElementById('status').innerHTML = 'OpenCV.js is ready.';

    let src = cv.imread(imgElement);
    // let dst = new cv.Mat();

    // imageMetadata(src);

    src = cropGrid(src);

    src = detectGrid(src);

    cv.imshow('canvasOutput', src);
    // dst.delete();
    src.delete();
}

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

    // https://docs.opencv.org/3.4/d5/daa/tutorial_js_contours_begin.html
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    // https://docs.opencv.org/3.4/d3/dc0/group__imgproc__shape.html#ga819779b9857cc2f8601e6526a3a5bc71
    cv.findContours(bw, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

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
    hierarchy.delete();

    return src.roi(rect);
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
 * Find all cells in the grid, and do something with them!
 *
 * @param src full color image
 */
function detectGrid(src) {
    // this is made up based on a single image test... there's a better way to do this
    let cellSize = findCellWidth(src);

    // 4 is good for 9 cols (size=43), 8 is good for 7 cols (size=52).
    // 12% seems to match 2 images so far...
    let padding = Math.ceil(cellSize * .12);
    let size = cellSize + padding;

    let inner = Math.floor(size * .67);

    // draw rectangle starting in the bottom right corner
    // https://docs.opencv.org/3.4/dc/dcf/tutorial_js_contour_features.html
    // let rectangleColor = new cv.Scalar(255, 0, 0, 255);
    let rect = new cv.Rect(
        src.size().height - size,
        src.size().width - size,
        size,
        size
    );

    let rows = [];
    let row = [];

    // keep track of these to detect where the numbers will be
    let numCols = Math.floor(src.size().width / size);
    let numRows = Math.floor(src.size().height / size);

    let gridTop = src.size().height - (numCols * size);
    let gridLeft = src.size().width - (numRows * size);

    imageMetadata(src);

    // draw the full grid
    while (rect.x > 0 && rect.y > 0) {
        // full cell
        let point1 = new cv.Point(rect.x, rect.y);
        let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
        // cv.rectangle(src, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

        // middle 2/3 to account for drift or carryover treetops
        let point3 = new cv.Point(point1.x + inner, point1.y + inner);
        let point4 = new cv.Point(point2.x - inner, point2.y - inner);
        // cv.rectangle(src, point3, point4, rectangleColor, 2, cv.LINE_AA, 0);

        let innerRect = new cv.Rect(
            point4.x,
            point4.y,
            point3.x - point4.x,
            point3.y - point4.y
        );

        let cell = src.roi(innerRect);
        cell = blackAndWhite(cell, 120);

        // don't need to check every pixel...
        let avgColor = 0;
        let count = 0;
        for (let x = 0; x < cell.size().width; x+=5) {
            for (let y = 0; y < cell.size().height; y+=3) {
                avgColor += cell.ucharPtr(x, y);
                count++;
            }
        }

        avgColor = avgColor / count;
        if (avgColor > 0) {
            row.push('x');
            let rectangleColor = new cv.Scalar(255, 0, 0, 255);
            cv.rectangle(src, point3, point4, rectangleColor, 2, cv.LINE_AA, 0);
        } else {
            row.push('.');
            let rectangleColor = new cv.Scalar(0, 255, 0, 255);
            cv.rectangle(src, point3, point4, rectangleColor, 2, cv.LINE_AA, 0);
        }

        // move left
        rect.x -= size;

        // move up a row
        if (rect.x < 0) {
            rows.push(row.reverse().join(''));
            row = [];

            rect.x = src.size().width - size;
            rect.y -= size;
        }
    }

    grid = rows.reverse();

    console.log(grid);

    // uncomment this to just output grid stuff, nothing OCR related
    // return src;

    // now draw the box around the numbers
    // let point1 = new cv.Point(gridLeft, 0);
    // let point2 = new cv.Point(src.size().width, gridTop);
    // cv.rectangle(src, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

    // let point3 = new cv.Point(0, gridTop);
    // let point4 = new cv.Point(gridLeft, src.size().height);
    // cv.rectangle(src, point3, point4, rectangleColor, 2, cv.LINE_AA, 0);

    // check the number cell
    let numRect = new cv.Rect(
        gridLeft,
        0,
        size,
        gridTop - padding
    );

    let numRow = [];

    let colsLength = Math.ceil((src.size().width - gridLeft) / size);
    let rowsLength = Math.ceil((src.size().height - gridTop) / size);

    console.log('colsLength', colsLength);
    console.log('rowsLength', rowsLength);

    let results = [];

    for (let x = 0; x < colsLength; x++) {
        // let point1 = new cv.Point(numRect.x, numRect.y);
        // let point2 = new cv.Point(numRect.x + numRect.width, numRect.y + numRect.height);
        // cv.rectangle(src, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

        if ((numRect.x + size) > src.size().width) {
            console.log('adjusting width of number cell');
            numRect.x = src.size().width - size;
        }

        let cell = src.roi(numRect);
        // 80 works well for non-0, but 0 might be too dark.
        // so we might want to check if this is all black, and if so run again with smaller number
        // for OCR we want white bg
        cell = blackAndWhite(cell, 50, false);

        // tesseract it!
        let result = findText(cell, 'col-' + x);
        results.push(result);

        // move right
        numRect.x += size;
    }

    // check the number cell
    numRect = new cv.Rect(
        0,
        gridTop,
        gridLeft - padding,
        size
    );

    for (let y = 0; y < rowsLength; y++) {
        // let point1 = new cv.Point(numRect.x, numRect.y);
        // let point2 = new cv.Point(numRect.x + numRect.width, numRect.y + numRect.height);
        // cv.rectangle(src, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

        if ((numRect.y + size) > src.size().height) {
            console.log('adjusting height of number cell');
            numRect.y = src.size().height - size;
        }

        let cell = src.roi(numRect);
        // // 80 works well for non-0, but 0 might be too dark.
        // // so we might want to check if this is all black, and if so run again with smaller number
        // // for OCR we want white bg
        cell = blackAndWhite(cell, 50, false);

        // tesseract it!
        let result = findText(cell, 'row-' + y);
        results.push(result);

        // move down
        numRect.y += size;
    }

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

        printInput(colNums, rowNums);
    });

    return src;
}

function findCellWidth(src) {
    let src2 = src.clone();
    let dst = new cv.Mat();

    // blur to help with edge detection in the next step? Maybe not necessary
    // https://docs.opencv.org/3.4/dd/d6a/tutorial_js_filtering.html
    cv.cvtColor(src2, src2, cv.COLOR_RGBA2RGB, 0);
    cv.bilateralFilter(src2, dst, 3, 75, 75, cv.BORDER_DEFAULT);

    // 30 - 50 seems to detect the squares the best
    let bw = blackAndWhite(dst, 40);

    // https://docs.opencv.org/3.4/d7/de1/tutorial_js_canny.html
    // https://docs.opencv.org/3.4/dd/d1a/group__imgproc__feature.html#ga04723e007ed888ddf11d9ba04e2232de
    cv.Canny(bw, bw, 20, 50, 3, false);

    //*
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    // https://docs.opencv.org/3.4/d3/dc0/group__imgproc__shape.html#ga819779b9857cc2f8601e6526a3a5bc71
    cv.findContours(bw, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // find most common width
    let widths = {};

    // find all of the bounding rectangles to find where objects are
    for (let i = 0; i < contours.size(); ++i) {
        let rect = cv.boundingRect(contours.get(i));

        // console.log(rect);
        if (!widths[rect.width]) {
            widths[rect.width] = 0;
        }
        widths[rect.width]++;

        // let color = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255),
                                      // Math.round(Math.random() * 255));
        // cv.drawContours(bw, contours, i, color, 4, cv.LINE_8, hierarchy, 100);
    }
    //*/

    // filter out probable outliers
    for(let key in widths) {
        if (key < 20 || key > 70 || widths[key] < 5) {
            delete widths[key];
        }
    };

    // calculate the weighted average of the widths
    let totalSum = 0;
    let weightSum = 0;
    for(let key in widths) {
        totalSum += key * widths[key];
        weightSum += widths[key];
    };

    let width = Math.ceil(totalSum / weightSum);

    src2.delete();
    dst.delete();
    bw.delete();

    return width;
}

/**
 * OCR to determine which digit(s) are in the image
 *
 * @param src black and white image of a number
 * @param id for the canvas
 */
async function findText(src, id) {
    let canvas = document.createElement('canvas');
    canvas.setAttribute('id', id);

    document.querySelector('body').append(canvas);

    cv.imshow(id, src);

    // configure the OCR worker
    const { createWorker } = Tesseract;
    const worker = await createWorker('eng');
    await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: 8 // PSM_SINGLE_WORD
    });

    // return the promise
    return await worker.recognize(document.getElementById(id))
        .then(function(result) {
            // if it's empty, return '?'
            let number = parseInt(result.data.text);
            if (isNaN(number)) {
                number = '?';
            }

            return {
                id: id,
                text: number
            }
        });
}

// blur to help with edge detection and combat image compression?
// cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
// cv.bilateralFilter(src, dst, 9, 75, 75, cv.BORDER_DEFAULT);

// maybe also use erosion + dilation = opening to remove noise (only with a binary image)?

// pyramids to find/match an object in the image? Not sure if that's useful yet or not

/**
 * Output the full grid data to a textarea
 */
function printInput(cols, rows) {
    let textarea = document.createElement('textarea');
    textarea.setAttribute('rows', rows.length+1);
    textarea.setAttribute('cols', cols.length+5);

    let input = ' ' + cols.join('') + "\r\n";
    for (y=0; y < rows.length; y++) {
        input += rows[y] + grid[y] + "\r\n";
    }
    textarea.value = input;

    document.querySelector('body').prepend(textarea);
}