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

let slider1Val = 0;
let slider2Val = 0;
let slider3Val = 0;

let ocr = false;
let fakingOutput = false;

let statuses = [];

let completedOCRCount = 0;

var onOpenCvReady = function() {
    updateStatus('OpenCV.js is ready');

    let placeholders = document.querySelectorAll('.placeholder img');
    placeholders.forEach(function(item, index) {
        item.addEventListener('click', function(e) {
            updateStatus('');
            updateStatus('New image clicked...');

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

    let slider1 = document.querySelector('#slider1');
    if (slider1) {
        slider1.addEventListener('change', function(e) {
            slider1Val = parseInt(this.value);
            // console.log('new slider1 value: ', slider1Val);
            processImage();
        });
    }

    let slider2 = document.querySelector('#slider2');
    if (slider2) {
        slider2.addEventListener('change', function(e) {
            slider2Val = parseInt(this.value);
            // console.log('new slider2 value: ', slider2Val);
            processImage();
        });
    }

    let slider3 = document.querySelector('#slider3');
    if (slider3) {
        slider3.value = 5; // reset it on page load
        slider3Val = parseInt(slider3.value);
        slider3.addEventListener('change', function(e) {
            slider3Val = parseInt(this.value);
            // console.log('new slider3 value: ', slider2Val);
            updateStatus('');
            updateStatus('Grid return level adjusted...');
            processImage();
        });
    }

    let ocrCheckbox = document.querySelector('#ocr-checkbox');
    if (ocrCheckbox) {
        ocrCheckbox.checked = true; // reset it on page load
        ocr = ocrCheckbox.checked;
        ocrCheckbox.addEventListener('change', function(e) {
            ocr = ocrCheckbox.checked;
            updateStatus('');
            updateStatus('OCR ' + (ocr ? 'enabled' : 'disabled') + ', reprocessing...');
            processImage();
        });
    }

    processImage();
}

function processImage() {
    updateStatus('Processing image...');

    grid = [];
    verticalLines = [];
    horizontalLines = [];
    completedOCRCount = 0;

    let form = document.querySelector('form');

    let src = cv.imread(imgElement);
    // let dst = new cv.Mat();

    // imageMetadata(src);

    let textarea = document.querySelector('#puzzleInput');
    textarea.setAttribute('style', 'display:none');
    textarea.value = '';

    if (!fakingOutput) {
        let output = document.querySelector('#puzzleSolution');
        output.innerText = '';
    }

    let ocrPlaceholders = document.querySelectorAll('.ocr-placeholder');
    ocrPlaceholders.forEach((canvas) => {
        canvas.remove();
    });

    updateStatus('Cropping grid...');
    src = cropGrid(src);

    updateStatus('Detecting cells...');
    src = detectGrid(src);

    cv.imshow('canvasOutput', src);

    src.delete();

    // to fake the solution image output (with trees-6)
    if (fakingOutput) {
        displaySolutionGrid(JSON.parse(document.querySelector('#puzzleSolution').innerText));
    }
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
    bw = blackAndWhite(src, 40);

    if (slider3Val === 0) {
        return bw;
    }

    // https://docs.opencv.org/3.4/d7/de1/tutorial_js_canny.html
    let edges = new cv.Mat();
    cv.Canny(bw, edges, slider1Val, slider2Val, apertureSize = 3);

    if (slider3Val === 1) {
        return edges;
    }

    // dilate/dissolve to make the lines more prominent
    // https://docs.opencv.org/3.4/d4/d76/tutorial_js_morphological_ops.html
    // works well for up to 10x10
    let M2 = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, M2);

    if (slider3Val === 2) {
        return edges;
    }

    // https://docs.opencv.org/3.4/d3/de6/tutorial_js_houghlines.html
    let lines = new cv.Mat();
    // works well up to 10x10
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, threshold = 120, minLength = 450, maxGap = 300);
    // TODO: find params that work for 13
    // cv.HoughLinesP(edges, lines, 1, Math.PI / 180, threshold = 120, minLength = 450, maxGap = 300);
    // cv.HoughLines(src, lines, 100, Math.PI / 180, 30, 0, 0, 0, Math.PI);
    // cv.HoughLines(src, lines, 1, Math.PI / 180, 30, 0, 0, Math.PI / 4, Math.PI / 2);

    console.log('lines', lines.rows);

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

    console.log('verticalLines', verticalLines);
    console.log('horizontalLines', horizontalLines);

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

    if (slider3Val === 3) {
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

    console.log('grid', grid);

    // return early if we're not running OCR
    if (!ocr) {
        updateStatus('OCR disabled, returning image');
        return src;
    }

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

        updateStatus('Printing grid...');
        printInput(colNums, rowNums, grid);
    });

    return src;
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
        console.log('skipping OCR for ' + id);
        // don't bother sending to OCR!
        let thenable = {
          then(onFulfilled, onRejected) {
            onFulfilled({
              // The thenable is fulfilled with another thenable
              then(onFulfilled, onRejected) {
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

        // account for a 20% difference in either direction
        if (diff < (averageDistance * .8) || diff > (averageDistance * 1.2)) {
            // remove this item
            lines.splice(i, 1);
            // loop using this line again
            i++;
        }
    }

    // return smallest to biggest
    lines = lines.reverse();

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
            completedOCRCount++;
            updateStatus('Single OCR number complete: ' + completedOCRCount);

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
    let textarea = document.querySelector('#puzzleInput');
    textarea.setAttribute('rows', rows.length+1);
    textarea.setAttribute('cols', cols.length+5);
    textarea.setAttribute('style', 'display:block');

    let input = ' ' + cols.join('') + "\n";
    for (y=0; y < rows.length; y++) {
        input += rows[y] + grid[y] + "\n";
    }
    textarea.value = input;

    if (slider3Val === 5) {
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
            console.log('response', response);

            updateStatus('Complete!');
            updateStatus(response.success ? 'Solved!' : 'Not solved :(');
            document.querySelector('#puzzleSolution').innerHTML = JSON.stringify(response.tents);

            updateStatus('Displaying results...');
            displaySolutionGrid(response.tents);
        });
    }
}

function updateStatus(status) {
    if (status == '') {
        statuses = [];
    } else {
        statuses.push(status);
    }

    document.getElementById('status').innerHTML = statuses.join('<br>');
}
