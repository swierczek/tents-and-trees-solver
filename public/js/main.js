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

let cols = [];
let rows = [];
let grid = [];

let colTextFoundCount = 0;
let rowTextFoundCount = 0;

let colsLength = 0;
let rowsLength = 0;

let colsEventTriggered = false;
let rowsEventTriggered = false;

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
    // this is made but based on a single image test... there's a better way to do this
    let padding = 4;
    let size = findCellWidth(src) + padding;
    let inner = Math.floor(size * .67);

    // draw rectangle starting in the bottom right corner
    // https://docs.opencv.org/3.4/dc/dcf/tutorial_js_contour_features.html
    let rectangleColor = new cv.Scalar(255, 0, 0);
    let rect = new cv.Rect(
        src.size().height - size,
        src.size().width - size,
        size,
        size
    );

    let rows = [];
    let row = [];

    // keep track of these to detect where the numbers will be
    let gridTop = src.size().height;
    let gridLeft = src.size().width;

    imageMetadata(src);

    // draw the full grid
    while (rect.x > 0 && rect.y > 0) {
        let point1 = new cv.Point(rect.x, rect.y);
        let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
        // cv.rectangle(src, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

        let point3 = new cv.Point(point1.x + inner, point1.y + inner);
        let point4 = new cv.Point(point2.x - inner, point2.y - inner);
        cv.rectangle(src, point3, point4, rectangleColor, 2, cv.LINE_AA, 0);

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
                avgColor += cell.ucharPtr(x, y)
                count++;
            }
        }

        avgColor = avgColor / count;
        if (avgColor > 40) {
            row.push('x');
        } else {
            row.push('.');
        }

        // move left
        rect.x -= size;

        if (rect.x > 0) {
            gridLeft = rect.x;
        }
        if (rect.y > 0) {
            gridTop = rect.y;
        }

        if (rect.x < 0) {
            rows.push(row.reverse().join(''));
            row = [];
            // console.log('row', row.reverse().join(''));
            rect.x = src.size().width - size;
            rect.y -= size;
        }
    }

    grid = rows.reverse();

    console.log(grid);

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

    colsLength = Math.ceil((src.size().width - gridLeft) / size);
    rowsLength = Math.ceil((src.size().height - gridTop) / size);

    console.log('colsLength', colsLength);
    console.log('rowsLength', rowsLength);

    for (let x = 0; x < colsLength; x++) {
        // let point1 = new cv.Point(numRect.x, numRect.y);
        // let point2 = new cv.Point(numRect.x + numRect.width, numRect.y + numRect.height);
        // cv.rectangle(src, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

        let cell = src.roi(numRect);
        // 80 works well for non-0, but 0 might be too dark.
        // so we might want to check if this is all black, and if so run again with smaller number
        // for OCR we want white bg
        cell = blackAndWhite(cell, 50, false);

        // tesseract it!
        let result = findText(cell, 'col-' + x, x);
        console.log(result);
        numRow[result.num] = result.text;

        // move right
        numRect.x += size;

        // return cell;
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
            numRect.y = src.size().height - size;
        }

        console.log(src.size());
        console.log(numRect);

        let cell = src.roi(numRect);
        // // 80 works well for non-0, but 0 might be too dark.
        // // so we might want to check if this is all black, and if so run again with smaller number
        // // for OCR we want white bg
        cell = blackAndWhite(cell, 50, false);

        // tesseract it!
        let result = findText(cell, 'row-' + y, y, false);
        console.log(result);
        // numRow.push(findText(cell, 'col-' + (numRow.length+1) ));
        numRow[result.num] = result.text;

        // move up
        numRect.y += size;

        // return cell;
    }

    console.log(numRow);

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

async function findText(src, id, num, colVar = true) {
    // cv.imshow('canvasTemp', src);
    let canvas = document.createElement('canvas');
    canvas.setAttribute('id', id);

    document.querySelector('body').append(canvas);

    cv.imshow(id, src);

    const { createWorker } = Tesseract;
    (async () => {
        const worker = await createWorker('eng');
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789',
            // tessedit_pageseg_mode: 8 // PSM_SINGLE_WORD?
        });
        let char = await worker.recognize(document.getElementById(id))
            .then(function(result) {
                // The result object of a text recognition contains detailed data about all the text
                // recognized in the image, words are grouped by arrays etc
                // console.log(id, result);

                // Show recognized text in the browser somehow
                if (colVar) {
                    cols[num] = parseInt(result.data.text);
                    colTextFoundCount++;
                    console.log('cols', cols);

                    if (colTextFoundCount === colsLength) {
                        // Create the event
                        var event = new CustomEvent("col-nums-determined", { "detail": cols.join('') });

                        // Dispatch/Trigger/Fire the event
                        document.dispatchEvent(event);
                    }
                } else {
                    rows[num] = parseInt(result.data.text);
                    rowTextFoundCount++;
                    console.log('rows', rows);

                    if (rowTextFoundCount === rowsLength) {
                        // Create the event
                        var event = new CustomEvent("row-nums-determined", { "detail": rows.join('') });

                        // Dispatch/Trigger/Fire the event
                        document.dispatchEvent(event);
                    }
                }
                // cols[num] = result.data.text;
                // return {
                //     id: id,
                //     num: num,
                //     text: result.data.text
                // };
                return result.data.text;
            });
        // console.log(text);
    })();

    // detect 0-9
    // let char = await Tesseract.recognize(document.getElementById(id))
    //     .then(function(result) {
    //         // The result object of a text recognition contains detailed data about all the text
    //         // recognized in the image, words are grouped by arrays etc
    //         // console.log(id, result);

    //         // Show recognized text in the browser
    //         cols[num] = parseInt(result.data.text);
    //         // cols[num] = result.data.text;
    //         // return {
    //         //     id: id,
    //         //     num: num,
    //         //     text: result.data.text
    //         // };
    //         console.log(cols);
    //         return result.data.text;
    //     });

    // console.log(char);

    return '?';
}

// blur to help with edge detection and combat image compression?
// cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
// cv.bilateralFilter(src, dst, 9, 75, 75, cv.BORDER_DEFAULT);

// maybe also use erosion + dilation = opening to remove noise (only with a binary image)?

// pyramids to find/match an object in the image? Not sure if that's useful yet or not

// Add an event listener
document.addEventListener("col-nums-determined", function(e) {
    console.log('event listener', e.detail); // Prints "Example of an event"

    colsEventTriggered = true;
    if (colsEventTriggered && rowsEventTriggered) {
        printInput();
    }
});

document.addEventListener("row-nums-determined", function(e) {
    console.log('event listener', e.detail); // Prints "Example of an event"

    rowsEventTriggered = true;
    if (colsEventTriggered && rowsEventTriggered) {
        printInput();
    }
});

function printInput() {
    let textarea = document.createElement('textarea');
    textarea.setAttribute('rows', rowsLength);

    let input = ' ' + cols.join('') + "\r\n";
    for (y=0; y < colsLength; y++) {
        console.log(grid);
        input += rows[y] + grid[y] + "\r\n";
    }
    textarea.value = input;

    document.querySelector('body').prepend(textarea);
}