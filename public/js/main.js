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

var onOpenCvReady = function() {
    document.getElementById('status').innerHTML = 'OpenCV.js is ready.';

    let src = cv.imread(imgElement);
    // let dst = new cv.Mat();

    imageMetadata(src);

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
function blackAndWhite(src, threshold) {
    let bw = new cv.Mat();

    // grayscale it for easier detection
    cv.cvtColor(src, bw, cv.COLOR_RGBA2GRAY, 0);

    // https://docs.opencv.org/3.4/d7/dd0/tutorial_js_thresholding.html
    // https://docs.opencv.org/3.4/d7/d1b/group__imgproc__misc.html#gae8a4a146d1ca78c626a53577199e9c57
    cv.threshold(bw, bw, threshold, 255, cv.THRESH_BINARY);

    return bw
}

/**
 * Find all cells in the grid, and do something with them!
 *
 * @param src full color image
 */
function detectGrid(src) {
    // this is made but based on a single image test... there's a better way to do this
    let padding = 5;
    let size = findCellWidth(src) + padding;

    // draw rectangle starting in the bottom right corner
    // https://docs.opencv.org/3.4/dc/dcf/tutorial_js_contour_features.html
    let rectangleColor = new cv.Scalar(255, 0, 0);
    let rect = new cv.Rect(
        src.size().height - size,
        src.size().width - size,
        size,
        size
    );

    let row = '';

    // draw the full grid
    while (rect.x > 0 && rect.y > 0) {
        let point1 = new cv.Point(rect.x, rect.y);
        let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
        cv.rectangle(src, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

        let cell = src.roi(rect);

        cell = blackAndWhite(cell, 120);

        // move left
        rect.x -= size;

        if (rect.x < 0) {
            console.log('row', row.reverse());
            rect.x = src.size().width - size;
            rect.y -= size;
        }
    }

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

// blur to help with edge detection and combat image compression?
// cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
// cv.bilateralFilter(src, dst, 9, 75, 75, cv.BORDER_DEFAULT);

// maybe also use erosion + dilation = opening to remove noise (only with a binary image)?

// pyramids to find/match an object in the image? Not sure if that's useful yet or not
