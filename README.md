# Tents and Trees solver
Solver for the [Tents and Trees](https://play.google.com/store/apps/details?id=com.frozax.tentsandtrees) mobile game. Just upload a screenshot and find the solution!

# About
My version of *["given the opportunity, players will optimize the fun out of a game"](https://www.reddit.com/r/factorio/comments/7eu8m1/given_the_opportunity_players_will_optimize_the/)*.

The intention of this project was to create a solver for the mobile game and to learn some basic image processing and OCR methods.

Technologies used:
* [OpenCV.js](https://docs.opencv.org/3.4/d5/d10/tutorial_js_root.html) for all of the image processing and some OCR
* [Tesseract.js](https://tesseract.projectnaptha.com/) for some OCR

# Running locally
PHP is required for the solver on localhost. `php -S localhost:8087` will start a local server for testing.

# Image processing method (OpenCV)
When an image is uploaded or selected, these are the general steps that happen to process it before it's sent to the backend solver:
* Crop off the top 15% to remove the menu icons
* Trim the remaining image to give us just the grid area
  * Convert to black and white
  * Find the contours and bounding boxes and determine the outline of the remaining content - that's our overall grid area.
* Process the grid to determine the grid lines
  * Convert to black and white
  * Use Canny edge detection to find the edges
  * Erosion and dilation to combine many close edges together into a thicker solid line
  * Use Hough Transform to find all lines in the image
  * Determine only the vertical and horizontal lines
  * Filter out any lines close together
    * Part of this step also included a manual adjustment if 2 lines were detected to be farther apart than the average cell size. We assume that the Hough Transform just missed this for various reasons, and automatically insert a line here to bridge the gap.
  * Iterate over the remaining lines to inspect each cell, and simply check the middle 1/3 of the cell to see if it's all the same color (empty space) or not (tree).
    * Also calculate the standard deviation of cell sizes and count the grid size to determine if our input parameters for Hough Transform provided a good input or not. Through testing, it seemed like one set of parameters worked for grids up to ~13x13, but larger than that needed another set of parameters to work consistently. This is accounted for by including 2 buttons to allow the user to select which preset to use, depending on if the detected grid looks correct or not.
* Run OCR to detect column and row numbers
  * Tesseract was the initial strategy here, but it frequently mixed up 4s and 6s, and it was less reliable with small image resolutions than I was hoping. In the end, a custom OpenCV matchTemplate solution proved much more accurate due to the consisteny in the number format, but I've left the Tesseract functionality around as an option anyway.
* Send the detected grid to the backend solver and display the found solution.

# Solver logic (PHP)
The overall method used is a kind of brute force loop which runs through various strategies over and over until either no change was detected in that loop (additional logic likely needs to be implemented in that case) or all of the tent locations have been found.

Solving methods:
* Fill all cells that are known to be grass
* Fill all columns/rows that have no remaining tents
* Fill grass for any kitty-corner tent options
* Fill all tents where it's the last option for a given tree
* Regex match to detect known logical patterns and set grass or tents accordingly - this was the fun/easy part to implement!
* Lastly, pair up any new tents to trees, if possible, so the next solver loop can treat those essentially the same as grass

It's a very basic method and could certainly be improved with some additional caching, classes, pattern permutations, and a processing queue (i.e. grass was detected at `{x: 4, y: 7}`, then process columns 3-5 and rows 6-8 next), but it works for now.