<?php

$solver = new TentSolver();

die();

/*
    Future improvements:
    - Make rows/columns classes to keep track of completeness, tree count, tent count, unknown count
    - Add trees to array so we can check each without needing to scan the full map
    - Add unknowns to array so we can check each without needing to scan the full map
    - Add a queue service to add newly changed cells to, so we only need to recheck those changed row/cols

    When iterating over $map, the first loop is $map = $y => $row, and the second loop is $row = $x => $cell
    We access the coordinates directly like $map[y][x], but the function getters/setters us x,y for simplicity.

    $rowCounts = $y => $count
    $colCounts = $x => $count
*/

class TentSolver {
    // For reasons of laziness, the input file uses . as Unknown, and any other character as tree,
    // but when printing this, we want a space to be Unknown and . to be Grass.
    // so in setup() we replace . with space and anything else with tree
    const UNKNOWN = ' ';
    const GRASS = '.';
    const TENT = 'N';
    const TREE = 'T';
    const NOTHING = '';

    const INPUT_UNKNOWN = '.';

    const PATTERN_UNKNOWN = 'o';
    const PATTERN_KNOWN = 'x';
    const PATTERN_PREFIX = '/^[^o]*';
    const PATTERN_SUFFIX = '[^o]*$/';

    private $map = []; // $map[$y][$x]
    private $rowCounts = [];
    private $colCounts = [];
    private $numRows = 0;
    private $numCols = 0;
    private $treeCount = 0;
    private $tentCount = 0;

    // $x,$y tree => $x,$y tent
    private $pairs = [];

    // o represents unknown spaces, x represents known spaces (but we don't care what their value is)
    private $patterns = [
        0 => [], // nothing left to find!
        1 => [
            // oo means both cells in other rows will be grass
            // '(oo)' => [
            //     'marker' => self::GRASS,
            // ],
            // // ooo means the middle cell in other rows will be grass
            // 'o(o)o' => [
            //     'marker' => self::GRASS,
            // ],
            // oxo means the middle cell in other rows will be grass
            'o(x)o' => [
                'marker' => self::GRASS,
            ],
        ],
        2 => [
            //oxoxxo means the first x in other rows will be grass
            'o(x)ox{2,}o' => [
                'marker' => self::GRASS,
            ],
            //oooxo means the x in other rows will be grass
            'o{3}(x)o' => [
                'marker' => self::GRASS,
            ],
            //oxxxxxoo means the first o will be a tent
            '(o)x{2,}oo' => [
                'marker' => self::TENT,
            ],
            // ooxo means the second 0 will be a tent, and the first 2 in other rows will be grass
            'oox(o)' => [
                'marker' => self::TENT,
            ],
            '(oo)xo' => [
                'marker' => self::GRASS,
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
            if ($row === 0) {
                $this->colCounts = str_split($l);
                continue;
            }

            // see note about laziness at the top of the class file
            $split = [];
            foreach(str_split($l) as $y => $cell) {
                if ($y === 0) {
                    $this->rowCounts[] = $cell;
                } else if ($cell === self::INPUT_UNKNOWN) {
                    $split[] = self::UNKNOWN;
                } else {
                    $split[] = self::TREE;
                    $this->treeCount++;
                }
            }

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
        while ($changed && $this->tentCount !== $this->treeCount && $temp < 8) {
            $changed = false;
            $temp++;

            // e('loop ' . $temp);

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

        // $changed = $this->patternMatchRows() || $changed;


        $this->print();

        if ($changed && $this->tentCount === $this->treeCount) {
            e('SOLVED SOLVED SOLVED!!!');
        } else {
            e('~~~~~ NOT SOLVED ~~~~~ maybe additional patterns need to be implemented?');
        }
        e('num loops: ' . $temp);
        e('changed: ' . ($changed ? 'yes' : 'no'));
        e('tent/tree counts match: ' . ($this->tentCount === $this->treeCount ? 'yes' : 'no'));
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
        foreach($this->getAllCells(self::UNKNOWN) as $d) {
            list($x, $y, $cell) = $d;

            list($above, $below, $left, $right) = $this->getAdjacentCells($x, $y);

            if (
                // exclude paired trees too
                ($above !== self::TREE || ($above === self::TREE && $this->isPaired($x, $y-1)))
                && ($below !== self::TREE || ($below === self::TREE && $this->isPaired($x, $y+1)))
                && ($left !== self::TREE || ($left === self::TREE && $this->isPaired($x-1, $y)))
                && ($right !== self::TREE || ($right === self::TREE && $this->isPaired($x+1, $y)))
            ) {
                $changed = $this->mark($x, $y, self::GRASS) || $changed;
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
                echo '<pre>';
                var_dump('filling all unknowns as tents');
                var_dump($x);
                echo '</pre>';
                // die();
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

        foreach($this->getAllCells(self::TREE) as $d) {
            list($x, $y, $cell) = $d;

            if ($this->isPaired($x, $y)) {
                continue;
            }

            list($above, $below, $left, $right) = $this->getAdjacentCells($x, $y);

            $counts = array_count_values([$above, $below, $left, $right]);

            // check 4 possible spots
            $above = intval($above === self::UNKNOWN);
            $below = intval($below === self::UNKNOWN);
            $left = intval($left === self::UNKNOWN);
            $right = intval($right === self::UNKNOWN);

            // only one last spot to put it!
            if ($counts[self::UNKNOWN] === 1 && ($counts[self::NOTHING] + $counts[self::GRASS] + $counts[self::TREE] === 4)) {
                if ($above) {
                    echo '<pre>';
                    var_dump('above');
                    echo '</pre>';
                    die();
                    $changed = $this->markTent($x, $y - 1) || $changed;
                } else if ($below) {
                    echo '<pre>';
                    var_dump('below');
                    echo '</pre>';
                    die();
                    $changed = $this->markTent($x, $y + 1) || $changed;
                } else if ($left) {
                    echo '<pre>';
                    var_dump('left');
                    echo '</pre>';
                    die();
                    $changed = $this->markTent($x - 1, $y) || $changed;
                } else if ($right) {
                    echo '<pre>';
                    var_dump('right');
                    echo '</pre>';
                    die();
                    $changed = $this->markTent($x + 1, $y) || $changed;
                }
            }
        }

        return $changed;
    }



    /**
     * Helpers
     */


    /**
     * Flatten the 2d array into a single iterable list with x/y coordinates
     * and cell data for easier iteration.
     *
     * Usage: foreach($this->getAllCells() as $d) {
     *          list($x, $y, $cell) = $d;
     */
    private function getAllCells($type = ''): array
    {
        $cells = [];

        foreach($this->map as $y => $row) {
            foreach($row as $x => $cell) {
                if ($type !== '' && $cell !== $type) {
                    continue;
                }

                $cells[] = [
                    $x,
                    $y,
                    $cell,
                ];
            }
        }

        return $cells;
    }

    /**
     * Return the values of all 4 adjacent cells (above, below, left, right)
     *
     * Usage: list($above, $below, $left, $right) = $this->getAdjacentCells($x, $y);
     */
    private function getAdjacentCells(int $x, int $y): array
    {
        return [
            $this->getCell($x, $y-1),
            $this->getCell($x, $y+1),
            $this->getCell($x-1, $y),
            $this->getCell($x+1, $y),
        ];
    }

    private function getCell(int $x, int $y): string
    {
        return $this->map[$y][$x] ?? '';
    }

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

        list($above, $below, $left, $right) = $this->getAdjacentCells($x, $y);

        // attempt to pair this tent to a tree, if only one tree is around this tent
        // TODO: enhancement, if only 1 unpaired tree is around this tent...
        $aboveIsTree = intval($above === self::TREE);
        $belowIsTree = intval($below === self::TREE);
        $leftIsTree  = intval($left === self::TREE);
        $rightIsTree = intval($right === self::TREE);

        // pair it!
        if (($aboveIsTree + $belowIsTree + $leftIsTree + $rightIsTree) === 1) {
            if ($aboveIsTree) {
                $this->setPaired($x, $y-1, $x, $y);
            } else if ($belowIsTree) {
                $this->setPaired($x, $y+1, $x, $y);
            } else if ($leftIsTree) {
                $this->setPaired($x-1, $y, $x, $y);
            } else if ($rightIsTree) {
                $this->setPaired($x+1, $y, $x, $y);
            }
        }

        return $changed;
    }

    /**
     * Mark a cell as a certain type
     *
     * @return whether it was successful or not
     */
    private function mark(int $x, int $y, string $type): bool
    {
        if (!isset($this->map[$y][$x])) {
            return false;
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
        e('-----------');

        $currRow = '';
        foreach($this->getAllCells() as $d) {
            list($x, $y, $cell) = $d;

            // keep track of which row we're outputting and add a newline on new rows
            if ($currRow === '') {
                $currRow = $y;
            }

            if ($y !== $currRow) {
                e();
                $currRow = $y;
            }

            // output col #s
            if ($x === 0 && $y === 0) {
                e('    ' . implode(' ', $this->colCounts));
                e('    ' . implode(' ', range(0, $this->numCols-1)));
            }

            // output row #s
            if ($x === 0) {
                echo $this->rowCounts[$y] . ' ' . $y . ' ';
            }

            echo $cell . ' ';
        }

        e();

        echo "\nTree->tent pairs\n";
        foreach($this->pairs as $tree => $tent) {
            e("$tree -> $tent");
        }

        e('-----------------------');
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
    function patternMatchRows(): bool
    {
        $changed = false;

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

            if ($remainingTents < 0) {
                e('ERROR TOO MANY TENTS in row ' . $y);
                die;
            }

            foreach($this->patterns[$remainingTents] as $pattern => $details) {
                $regex = self::PATTERN_PREFIX . $pattern . self::PATTERN_SUFFIX;
                $matched = preg_match($regex, $rowString, $matches, PREG_OFFSET_CAPTURE);

                // no match
                if ($matched === 0) {
                    continue;
                }

                e('Pattern matched');
                e('   row: ' . $y);
                e('   rowString: ' . $rowString);
                e('   pattern: ' . $pattern);

                // $matches[x][1] is the byte offset in the string of the matched pattern (for a single pattern)

                for($j=1; $j<count($matches); $j++) {
                    $chars = str_split($matches[$j][0]);
                    $x = $matches[$j][1];

                    if ($details['marker'] === self::GRASS) {
                        // loop over every matched character in case we need to mark multiple grasses
                        for($c=0; $c<count($chars); $c++) {
                            $changed = $this->mark($x+$c, $y-1, $details['marker']) || $changed;
                            $changed = $this->mark($x+$c, $y+1, $details['marker']) || $changed;
                        }
                    } else if ($details['marker'] === self::TENT) {
                        $changed = $this->markTent($x, $y) || $changed;
                    }
                }
            }
        }

        return $changed;
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

function e($input = '') {
    if (is_bool($input)) {
        $input = $input ? 'true' : 'false';
    }

    echo $input . "\n";
}