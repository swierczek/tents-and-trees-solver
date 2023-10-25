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

let slider1Val = 0;
let slider2Val = 0;

var onOpenCvReady = function() {
    document.getElementById('status').innerHTML = 'OpenCV.js is ready.';

    let placeholders = document.querySelectorAll('.placeholder img');
    placeholders.forEach(function(item, index) {
        item.addEventListener('click', function(e) {
            imgElement.src = item.src;
            processImage();
        });
    });

    let slider1 = document.querySelector('#slider1');
    slider1.addEventListener('change', function(e) {
        slider1Val = parseInt(this.value);
        console.log('new slider1 value: ', slider1Val);
        processImage();
    });

    let slider2 = document.querySelector('#slider2');
    slider2.addEventListener('change', function(e) {
        slider2Val = parseInt(this.value);
        console.log('new slider2 value: ', slider2Val);
        processImage();
    })

    processImage();
}

function processImage() {
    let src = cv.imread(imgElement);
    // let dst = new cv.Mat();

    // imageMetadata(src);

    let textareas = document.querySelectorAll('textarea');
    textareas.forEach((textarea) => {
        textarea.remove();
    });

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

    console.log(rect);
    console.log(src.size());

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
    bw = blackAndWhite(src, 67);

    // https://docs.opencv.org/3.4/d7/de1/tutorial_js_canny.html
    let edges = new cv.Mat();
    cv.Canny(bw, edges, slider1Val, slider2Val, apertureSize = 3);

    // dilate/dissolve to make the lines more prominent
    // https://docs.opencv.org/3.4/d4/d76/tutorial_js_morphological_ops.html
    let M2 = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, M2);

    // https://docs.opencv.org/3.4/d3/de6/tutorial_js_houghlines.html
    let lines = new cv.Mat();
    // cv.HoughLines(src, lines, 100, Math.PI / 180, 30, 0, 0, 0, Math.PI);
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, threshold = 120, minLength = 450, maxGap = 300);
    // cv.HoughLines(src, lines, 1, Math.PI / 180, 30, 0, 0, Math.PI / 4, Math.PI / 2);

    // determine lines
    // start with a line on the right
    let verticalLines = [src.size().width-1];
    // start with a line on the bottom
    let horizontalLines = [src.size().height-1];

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

    let gridTop = Math.min(...horizontalLines);
    let gridLeft = Math.min(...verticalLines);
    let gridBottom = Math.max(...horizontalLines);
    let gridRight = Math.max(...verticalLines);

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

    let grid = [];

    // now iterate over the lines to detect the cells
    for(x=0; x<verticalLines.length-1; x++) {
        let row = [];
        let x1 = verticalLines[x];
        let x2 = verticalLines[x+1];

        for(y=0; y<horizontalLines.length-1; y++) {
            let y1 = horizontalLines[y];
            let y2 = horizontalLines[y+1];

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

    console.log('grid', grid);

    let results = [];

    for (let x = 0; x < verticalLines.length-1; x++) {
        let numRect = new cv.Rect(
            verticalLines[x],
            0,
            verticalLines[x+1] - verticalLines[x],
            gridTop
        );

        // let point1 = new cv.Point(numRect.x, numRect.y);
        // let point2 = new cv.Point(numRect.x + numRect.width, numRect.y + numRect.height);
        // let rectangleColor = new cv.Scalar(255, 0, 0, 255);
        // cv.rectangle(src, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

        let cell = src.roi(numRect);
        // for OCR we want white bg
        cell = blackAndWhite(cell, 50, false);

        // tesseract it!
        let result = findText(cell, 'col-' + x);
        results.push(result);
    }

    for (let y = 0; y < horizontalLines.length-1; y++) {
        let numRect = new cv.Rect(
            0,
            horizontalLines[y],
            gridLeft,
            horizontalLines[y+1] - horizontalLines[y]
        );

        // let point1 = new cv.Point(numRect.x, numRect.y);
        // let point2 = new cv.Point(numRect.x + numRect.width, numRect.y + numRect.height);
        // let rectangleColor = new cv.Scalar(255, 0, 0, 255);
        // cv.rectangle(src, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

        let cell = src.roi(numRect);
        // for OCR we want white bg
        cell = blackAndWhite(cell, 50, false);

        // tesseract it!
        let result = findText(cell, 'row-' + y);
        results.push(result);
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

        printInput(colNums, rowNums, grid);
    });

    return src;
}

function removeOutliers(lines) {
    lines = lines.filter(e=>e);
    lines.sort(function(a, b) {
        return a - b;
    });
    lines = lines.reverse();

    // sorted biggest to smallest
    console.log('sorted', lines);

    // the first 3 will give us a good sense of distance
    let averageDistance = 0;
    for(let i=0; i<3; i++) {
        averageDistance += Math.abs(lines[i] - lines[i+1]);
    }
    averageDistance = averageDistance / 3;

    console.log('average', averageDistance);

    for(var i = lines.length - 1; i >= 0; i--){
        let diff = Math.abs(lines[i] - lines[i-1]);

        if (diff < (averageDistance * .8) || diff > (averageDistance * 1.2)) {
            // remove this item
            lines.splice(i, 1);
            // loop using this line again
            i++;
        }
    }

    // return smallest to biggest
    lines = lines.reverse();

    console.log('removed outliers', lines);

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
    canvas.setAttribute('id', id);

    document.querySelector('body').append(canvas);

    cv.imshow(id, src);

    // configure the OCR worker
    // https://github.com/naptha/tesseract.js/blob/HEAD/docs/api.md#create-worker
    const { createWorker } = Tesseract;
    const worker = await createWorker('eng');
    await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: 8 // PSM_SINGLE_WORD
    });
    // await worker.terminate(); // maybe?

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
function printInput(cols, rows, grid) {
    let textarea = document.createElement('textarea');
    textarea.setAttribute('rows', rows.length+1);
    textarea.setAttribute('cols', cols.length+5);

    console.log(rows);
    console.log(cols);
    console.log(grid);

    let input = ' ' + cols.join('') + "\r\n";
    for (y=0; y < rows.length; y++) {
        input += rows[y] + grid[y] + "\r\n";
    }
    textarea.value = input;

    document.querySelector('body').prepend(textarea);
}