<?php

$solver = new TentSolver();

die();

/*
    Future improvements:
    - Make columns an object to keep track of completeness, tree count, tent count, unknown count
    - Add trees to array so we can check each without needing to scan the full map
    - Add unknowns to array so we can check each without needing to scan the full map
    - Add a queue service to add newly changed cells to, so we only need to recheck those changed row/cols

    When iterating over $map, the first loop is $map = $y => $row, and the second loop is $row = $x => $cell
    We access the coordinates directly like $map[y][x], but the function getters/setters us x,y for simplicity.

    $rowCounts = $y => $count
    $colCounts = $x => $count
*/

class TentSolver {
    // For reasons of laziness, the input file uses . as Unknown, but when printing this,
    // we want a space to be Unknown and . to be grass. so in setup() we replace . with space
    const UNKNOWN = ' ';
    const GRASS = '.';
    const TENT = 'N';
    const TREE = 'T';

    const PATTERN_UNKNOWN = 'o';
    const PATTERN_KNOWN = 'x';
    const PATTERN_PREFIX = '/(?:^|x)';
    const PATTERN_SUFFIX = '(?:x|$)/';

    private $map = []; // $map[$y][$x]
    private $rowCounts = [];
    private $colCounts = [];
    private $numRows = 0;
    private $numCols = 0;
    private $treeCount = 0;
    private $tentCount = 0;

    // $x,$y tree => $x,$y tent
    private $pairs = [];

    // TODO: make this
    // o represents unknown spaces, x represents known spaces (but we don't care what their value is)
    private $patterns = [
        0 => [], // nothing left to find!
        1 => [
            // oo means both cells in other rows will be grass
            '(oo)' => [
                'marker' => self::GRASS,
                'offset' => [0],
            ],
            // ooo means the middle cell in other rows will be grass
            'o(o)o' => [
                'marker' => self::GRASS,
                'offset' => [0],
            ],
        ],
        2 => [
            //oxoxxo means the first x in other rows will be grass
            'o(x)ox{2,}o' => [
                'marker' => self::GRASS,
                'offset' => [0],
            ],
            //oooxo means the x in other rows will be grass
            'o{3}(x)o' => [
                'marker' => self::GRASS,
                'offset' => [0],
            ],
        ],
        3 => [

        ],
        4 => [

        ],
    ];

    public function __construct() {
        $this->setup();
        $this->run();
    }

    /**
     * Load the input file into arrays
     */
    function setup() {
        $filename = $argv[1] ?? 'tent-input.txt';

        $input = file_get_contents($filename);

        $lines = array_map('trim', explode("\n", $input));

        foreach($lines as $row => $l) {
            // see note about laziness at the top of the class file
            $l = str_replace(self::GRASS, self::UNKNOWN, $l);

            $split = str_split($l);

            if ($row === 0) {
                $this->colCounts = $split;
                continue;
            }

            $this->rowCounts[] = $split[0];
            unset($split[0]);

            $this->treeCount += $this->count($split, self::TREE);

            // row-1 because the first row is #s, array_values because it's 1-based because of #s
            $this->map[$row-1] = array_values($split);
        }

        $this->numRows = count($this->map);
        $this->numCols = count($this->map[0]);
    }

    /**
     * Run the solver!
     */
    function run() {
        $changed = true;

        $temp = 0;
        while ($changed && $this->tentCount !== $this->treeCount && $temp < 5) {
            $changed = false;
            $temp++;

            e('loop ' . $temp);

            e('fillGrass');
            $changed = $this->fillGrass() || $changed;
            $this->print();

            e('fillCols');
            $changed = $this->fillCols() || $changed;
            $this->print();

            e('fillRows');
            $changed = $this->fillRows() || $changed;
            $this->print();

            e('findLastTreesTents');
            $changed = $this->findLastTreesTents() || $changed;
            $this->print();

            e('patternMatchRows');
            $changed = $this->patternMatchRows() || $changed;
            $this->print();

            // $this->print();
            $this->validate();
        }

        // $changed = $this->patternMatchCols() || $changed;


        $this->print();
        e($temp);
        e($changed);
        e($this->tentCount === $this->treeCount);
        die();

        die();
    }

    /**
     * @return bool whether or not any map values changed as a result of this function
     */
    function fillGrass(): bool
    {
        $changed = false;

        // check each cell
        foreach($this->map as $y => $row) {
            foreach($row as $x => $cell) {

                if ($cell !== self::UNKNOWN) {
                    continue;
                }

                // TODO: exclude paired trees too?
                if (
                    @$this->map[$y-1][$x] !== self::TREE
                    && @$this->map[$y+1][$x] !== self::TREE
                    && @$this->map[$y][$x-1] !== self::TREE
                    && @$this->map[$y][$x+1] !== self::TREE

                    // && @$this->map[$y-1][$x] !== self::CLAIMED
                    // && @$this->map[$y+1][$x] !== self::CLAIMED
                    // && @$this->map[$y][$x-1] !== self::CLAIMED
                    // && @$this->map[$y][$x+1] !== self::CLAIMED
                ) {
                    $this->map[$y][$x] = self::GRASS;
                    $changed = true || $changed;
                }
            }
        }

        return $changed;
    }

    /**
     * Check each column and, if possible, fill it with either remaining grass or remaining tents
     */
    function fillCols(): bool
    {
        $changed = false;

        // check each col
        foreach($this->colCounts as $x => $colCount) {
            $col = $this->getCol($x);

            $remainingColTents = $colCount - $this->count($col, self::TENT);

            // go over every row in this column and mark it as grass
            if ($remainingColTents === 0) {
                for($i=0; $i < $this->numRows; $i++) {
                    $changed = $this->mark($x, $i, self::GRASS) || $changed;
                }
            } else if ($remainingColTents === $this->count($col, self::UNKNOWN)) {
                for($i=0; $i < $this->numRows; $i++) {
                    $changed = $this->markTent($x, $i) || $changed;
                }
            }
        }

        return $changed;
    }

    /**
     * Check each row and, if possible, fill it with either remaining grass or remaining tents
     */
    function fillRows(): bool
    {
        $changed = false;

        // check each row
        foreach($this->rowCounts as $y => $rowCount) {
            $row = $this->getRow($y);

            $remainingRowTents = $rowCount - $this->count($row, self::TENT);

            // go over every column in this row and mark it as grass
            if ($remainingRowTents === 0) {
                for($i=0; $i < $this->numRows; $i++) {
                    $this->mark($i, $y, self::GRASS);
                }
            } else if ($remainingRowTents === $this->count($row, self::UNKNOWN)) {
                for($i=0; $i < $this->numCols; $i++) {
                    $changed = $this->markTent($i, $y) || $changed;
                }
            }
        }

        return $changed;
    }

    /**
     * Go over every Tree, and if there's only one remaining space for a Tent, set it
     */
    function findLastTreesTents(): bool
    {
        $changed = false;

        foreach($this->map as $y => $row) {
            foreach($row as $x => $cell) {
                if ($cell === self::TREE) {
                    // TODO: bug here? We need to detect if this tree is already paired or not
                    if ($this->isPaired($y, $x)) {
                        continue;
                    }

                    echo "Tree at $x, $y is not paired\n";

                    // check 4 possible spots
                    $above = intval(@$this->map[$y - 1][$x] === self::UNKNOWN);
                    $below = intval(@$this->map[$y + 1][$x] === self::UNKNOWN);
                    $left  = intval(@$this->map[$y][$x - 1] === self::UNKNOWN);
                    $right = intval(@$this->map[$y][$x + 1] === self::UNKNOWN);


                    if (($above + $below + $left + $right) === 1) {
                        // only one last spot to put it!
                        if ($above) {
                            $changed = $this->markTent($x, $y - 1) || $changed;
                        } else if ($below) {
                            $changed = $this->markTent($x, $y + 1) || $changed;
                        } else if ($left) {
                            $changed = $this->markTent($x - 1, $y) || $changed;
                        } else if ($right) {
                            $changed = $this->markTent($x + 1, $y) || $changed;
                        }
                    }
                }
            }
        }

        return $changed;
    }



    /**
     * Helpers
     */



    /**
     * Mark the given coordinate as a tent, and all of its surrounding unknowns as grass
     * and attempt to pair it to a tree
     */
    private function markTent(int $x, int $y): bool
    {
        $changed = $this->mark($x, $y, self::TENT);

        if (!$changed) {
            return false;
        }

        $this->tentCount++;

        // mark surrounding cells as grass
        for($i=-1; $i<=1; $i++) {
            for($j=-1; $j<=1; $j++) {
                if (@$this->map[$y+$j][$x+$i] === self::UNKNOWN) {
                    $this->map[$y+$j][$x+$i] = self::GRASS;
                    $changed = true;
                }
            }
        }

        // attempt to pair this tent to a tree, if only one tree is around this tent
        // TODO: enhancement, if only 1 unpaired tree is around this tent...
        $above = intval(@$this->map[$y - 1][$x] === self::TREE);
        $below = intval(@$this->map[$y + 1][$x] === self::TREE);
        $left  = intval(@$this->map[$y][$x - 1] === self::TREE);
        $right = intval(@$this->map[$y][$x + 1] === self::TREE);

        // pair it!
        if (($above + $below + $left + $right) === 1) {
            if ($above) {
                $this->setPaired($x, $y-1, $x, $y);
            } else if ($below) {
                $this->setPaired($x, $y+1, $x, $y);
            } else if ($left) {
                $this->setPaired($x-1, $y, $x, $y);
            } else if ($right) {
                $this->setPaired($x+1, $y, $x, $y);
            }
        }

        return $changed;
    }

    /**
     * Mark a cell as a certain type
     *
     * @param bool $override may be needed if we want to mark a Tree as Claimed
     * @return whether it was successful or not
     */
    private function mark(int $x, int $y, string $type, bool $override = false): bool
    {
        if (!isset($this->map[$y][$x])) {
            return false;
        }

        if ($override) {
            $this->map[$y][$x] = $type;
            return true;
        }

        if ($this->map[$y][$x] == self::UNKNOWN) {
            $this->map[$y][$x] = $type;
            return true;
        }

        return false;
    }

    /**
     * Helper to get the given column array based on its index
     */
    private function getCol($id): array
    {
        return array_column($this->map, $id);
    }

    /**
     * Helper to get the given row array based on its index
     */
    private function getRow($id): array
    {
        return $this->map[$id];
    }

    /**
     * Helper to count the number of an item in an array
     */
    private function count($data, $item): int
    {
        return intval(@array_count_values($data)[$item]);
    }

    private function isPaired($x, $y): bool
    {
        return isset($this->pairs[$x.','.$y]);
    }

    private function setPaired($treeX, $treeY, $tentX, $tentY) {
        $this->pairs[$treeX.','.$treeY] = $tentX.','.$tentY;
    }

    // debugging
    private function print() {
        echo "\n\n";

        foreach($this->map as $y => $row) {
            foreach($row as $x => $cell) {
                // output col #s
                if ($x === 0 && $y === 0) {
                    echo '  ' . implode(' ', $this->colCounts) . "\n";
                }

                // output row #s
                if ($x === 0) {
                    echo $this->rowCounts[$y] . ' ';
                }

                echo $cell . ' ';
            }

            echo "\n";
        }

        echo "\nTree->tent pairs\n";
        foreach($this->pairs as $tree => $tent) {
            echo "$tree -> $tent\n";
        }

        echo "\n";
    }

    private function validate() {
        for($i=0; $i<$this->numCols; $i++) {
            $col = $this->getCol($i);

            // if the number of tents in this column is greater than the number expected
            if ($this->count($col, self::TENT) > $this->colCounts[$i]) {
                echo "ERROR ERROR ERROR col $i\n\n";
                $this->print();
                die;
            }
        }

        for($i=0; $i<$this->numRows; $i++) {
            $row = $this->getRow($i);

            // if the number of tents in this column is greater than the number expected
            if ($this->count($row, self::TENT) > $this->rowCounts[$i]) {
                echo "ERROR ERROR ERROR row $i\n\n";
                $this->print();
                die;
            }
        }

    }



    /**
     * Advanced solving techniques
     */

    /**
     * Match various patterns and add grass/tents as applicable
     */
    function patternMatchRows(): void
    {
        for($y=0; $y<$this->numRows; $y++) {
            $row = $this->getRow($y);

            // for regex matching purposes, we only care about empty vs non-empty
            // so string replace everything that's not empty to a single value
            // (this also keeps the regex looking simpler)
            // e.g. " T ... ." should become "oxoxxxox"
            $rowString = implode('', $row);
            $rowString = str_replace([self::TREE, self::GRASS, self::TENT], self::PATTERN_KNOWN, $rowString); // x
            $rowString = str_replace(self::UNKNOWN, self::PATTERN_UNKNOWN, $rowString); // o

            // we may also need to match on the reversed string in case the order of cells is flipped
            // TODO: handle this in the loop somehow
            // $rowStringReversed = strrev($rowString);

            $remainingTents = $this->rowCounts[$y] - $this->count($row, self::TENT);

            foreach($this->patterns[$remainingTents] as $pattern => $details) {
                $matched = preg_match(self::PATTERN_PREFIX.$pattern.self::PATTERN_SUFFIX, $rowString, $matches, PREG_OFFSET_CAPTURE);

                // no match
                if ($matched === 0) {
                    continue;
                }

                // $matches[x][1] is the byte offset in the string of the matched pattern (for a single pattern)

                for($j=1; $j<count($matches); $j++) {
                    $chars = str_split($matches[$j][0]);
                    $x = $matches[$j][1];

                    // loop over every matched character in case we need to mark multiple grasses
                    for($c=0; $c<count($chars); $c++) {
                        $this->mark($x+$c, $y-1, $details['marker']);
                        $this->mark($x+$c, $y+1, $details['marker']);
                    }
                }
            }
        }
    }

    /**
     * @todo: add this functionality similar to findLastTreesTents
     */
    function claimTents(): void
    {

    }

    /**
     * @todo: add this functionality if a Tree can only be in 2 kitty-corner spots,
     * then mark the space between those as grass
     */
    function markCornerGrass(): void
    {

    }
}

function e($string) {
    echo $string . "\n";
}