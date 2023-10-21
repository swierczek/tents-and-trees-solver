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
    let dst = new cv.Mat();

    // imageMetadata(src);

    src = cropGrid(src);

    // let cnt = contours.get(0);
    // You can try more different parameters
    // let rect2 = cv.boundingRect(cnt);
    // let contoursColor = new cv.Scalar(255, 255, 255);
    // let rectangleColor = new cv.Scalar(255, 0, 0);
    // cv.drawContours(dst, contours, 0, contoursColor, 1, 8, hierarchy, 100);
    // let point1 = new cv.Point(rect2.x, rect2.y);
    // let point2 = new cv.Point(rect2.x + rect2.width, rect2.y + rect2.height);
    // cv.rectangle(dst, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);

    // draw contours with random Scalar
    // for (let i = 0; i < contours.size(); ++i) {
    //     let color = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255),
    //                               Math.round(Math.random() * 255));
    //     cv.drawContours(edges, contours, i, color, 1, cv.LINE_8, hierarchy, 100);
    // }

    cv.imshow('canvasOutput', src);
    src.delete(); dst.delete();
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

function cropGrid(src) {
    // remove the top 15%
    src = removeTop(src);

    // to find contours, background should be black
    bw = blackAndWhite(src);

    // start both in the middle and work up/down from there
    let topCrop = bw.size().height / 2;
    let bottomCrop = bw.size().height / 2;

    // https://docs.opencv.org/3.4/d5/daa/tutorial_js_contours_begin.html
    let edges = cv.Mat.zeros(bw.rows, bw.cols, cv.CV_8UC3);
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    // https://docs.opencv.org/3.4/d3/dc0/group__imgproc__shape.html#ga819779b9857cc2f8601e6526a3a5bc71
    cv.findContours(bw, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // find all of the bounding rectangles to find where objects are
    for (let i = 0; i < contours.size(); ++i) {
        let rect = cv.boundingRect(contours.get(i));

        if (rect.y > bottomCrop) {
            bottomCrop = rect.y;
        }
        if (rect.y < topCrop) {
            topCrop = rect.y;
        }
    }

    console.log('top', topCrop);
    console.log('bottom', bottomCrop);

    let rect = new cv.Rect(
        0,
        topCrop - 3,
        bw.size().width,
        bottomCrop - topCrop + 12
    );

    contours.delete();
    hierarchy.delete();
    edges.delete();

    return src.roi(rect);
}

function blackAndWhite(src) {
    // grayscale it for easier detection
    cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);

    // https://docs.opencv.org/3.4/d7/dd0/tutorial_js_thresholding.html
    // figure out which funtion and params
    cv.threshold(src, src, 50, 255, cv.THRESH_BINARY);

    return src;
}

// blur to help with edge detection and combat image compression?
// cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
// cv.bilateralFilter(src, dst, 9, 75, 75, cv.BORDER_DEFAULT);

// maybe also use erosion + dilation = opening to remove noise (only with a binary image)?

// pyramids to find/match an object in the image? Not sure if that's useful yet or not

// edge detection to find the square size?
