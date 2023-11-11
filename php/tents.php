<?php

header("Access-Control-Allow-Origin: http://localhost:8086");

$source = 'cli';

if ($_POST && isset($_POST['puzzleInput'])) {
    $inputs = [
        $_POST['puzzleInput']
    ];
    $source = 'browser';
} else {
    $filename = $argv[1] ?? getcwd() . '/../resources/tent-inputs-other.txt';
    // $filename = $argv[1] ?? getcwd() . '/../resources/tent-input.txt';

    $inputs = explode("\n\n", file_get_contents($filename));
}

foreach($inputs as $key => $val) {
    $rows = explode("\n", $val);

    // if the first row isn't the column numbers, remove it
    if (!preg_match("/^ [\d?]+[\r\n]?$/", $rows[0])) {
        unset($rows[0]);
    }

    if ($rows[count($rows)-1] === "") {
        unset($rows[count($rows)-1]);
    }

    $inputs[$key] = implode("\n", $rows);
}

$outputSolution = false;

foreach($inputs as $key => $input) {
    // output the last solution
    $outputSolution = $key === count($inputs) - 1;

    $start = microtime(true);

    $solver = new TentSolver($input);
    $solver->setOutputLevel($source === 'browser' ? 0 : 1);
    $solver->setLineEnding($source === 'browser' ? '<br>' : "\n");
    $solver->setGridReturnType($source === 'browser' ? 'json' : 'txt');
    $result = $solver->solve($outputSolution);

    $duration = microtime(true) - $start;

    // if any tests fail, rerun with debug to essentially step through the solution so far
    if (!$result) {
        $solver->print('Solution NOT found for puzzle ' . $key . '. Running again with debug enabled.');
        $solver->setDebug(true);
        $solver->solve();

        die;
    }

    $solver->print('Solution found for puzzle ' . $key . ' in ' . $result . ' loops and ' . round(($duration * 1000), 1) . ' ms');

    if ($outputSolution) {
        $solver->print('Solution found for all puzzles!');
    }
}

die;

/*
    Future improvements:
    - Make rows/columns classes to keep track of completeness, tree count, tent count, unknown count
    - Add trees to array so we can check each without needing to scan the full map
    - Add unknowns to array so we can check each without needing to scan the full map
    - Add a queue service to add newly changed cells to, so we only need to recheck those changed row/cols

    When iterating over $map, the first loop is $map = $y => $row, and the second loop is $row = $x => $cell
    We access the coordinates directly like $map[y][x], but the function getters/setters use x,y for simplicity.

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
    const PATTERN_UNKNOWN_INPUT = '-'; // use this to write the pattern regexes, but convert it when matching
    const PATTERN_KNOWN = 'x';
    const PATTERN_PREFIX = '/^[^o]*';
    const PATTERN_SUFFIX = '[^o]*$/';

    const COL_ROW_UNKNOWN = '?';

    private $map = []; // $map[$y][$x]
    private $rowCounts = [];
    private $colCounts = [];
    private $numRows = 0;
    private $numCols = 0;
    private $treeCount = 0;
    private $tentCount = 0;

    private $debug = false;
    private $outputLevel = 0;
    private $lineEnding = "\n";
    private $gridReturnType = 'txt';

    // $x,$y tree => $x,$y tent
    private $pairs = [];

    // used to split the patterns into separate tokens so we can reverse it
    // a single o or x with {} format, or a single o or x, or parenthesis with 1+ o or x
    // (\(?[ox]{1}\{\d,?\}\)?)|([ox]{1})|(\([ox]+\)) to allow {2,} inside of parenthesis
    const PATTERN_REVERSE = '/([ox]{1}\{\d,?\})|([ox]{1})|(\([ox]+\))/';

    // o represents unknown spaces, x represents known spaces (but we don't care what their value is)
    private $patterns = [
        0 => [], // nothing left to find!
        1 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-' => self::GRASS,

            // oo means both cells in other rows will be grass
            '(--)' => self::GRASS,

            // ooo means the middle cell in other rows will be grass
            '-(-)-' => self::GRASS,
        ],
        2 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-(x)-' => self::GRASS,

            // oxoxxo means the first x in other rows will be grass
            '-(x)-x{2,}-' => self::GRASS,

            // oooxo means the x in other rows will be grass
            '---(x)-' => self::GRASS,

            // oxxoo means the first o will be a tent
            '(-)x{2,}--' => self::TENT,

            // ooxo means the second 0 will be a tent, and the first 2 in other rows will be grass
            '--x(-)' => self::TENT,
            '(--)x-' => self::GRASS,

            // ooxxxxoxo means the last x in other rows will be grass
            '--x{1,}-(x)-' => self::GRASS,

            // oooxoo means the middle o in other rows will be grass
            '-(-)-x{1,}--' => self::GRASS
        ],
        3 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-(x)-(x)-' => self::GRASS,

            // ooxooxo means the last o will be a tent
            '--x--x(-)' => self::TENT,
            '--x(-)x--' => self::TENT, // permutation of the previous
            '--x(-)x(-)' => self::TENT, // permutation of the previous

            // ooxxxoxo means the last 2 os must be tents
            '--x{2,}(-)x(-)' => self::TENT,

            // oxoxoxoo means the first x in other rows will be grass
            '-(x)-(x)-x--' => self::GRASS,

            // oooxxo means every other o will be a tent
            '(-)-(-)x{2,}(-)' => self::TENT,

            '(-)x{1,}--x{1,}--' => self::TENT,

            '(--)x(--)x(--)' => self::GRASS,
        ],
        4 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-(x)-(x)-(x)-' => self::GRASS,

            //
            '--x{1,}--x{1,}--x{1,}(-)' => self::TENT,

            '(--)x{1,}(--)x{1,}(--)' => self::GRASS,
        ],
        5 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-(x)-(x)-(x)-(x)-' => self::GRASS,
        ],
        6 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-(x)-(x)-(x)-(x)-(x)-' => self::GRASS,
        ],
        7 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-(x)-(x)-(x)-(x)-(x)-(x)-' => self::GRASS,
        ],
        8 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-(x)-(x)-(x)-(x)-(x)-(x)-(x)-' => self::GRASS,
        ],
        9 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-(x)-(x)-(x)-(x)-(x)-(x)-(x)-(x)-' => self::GRASS,
        ],
        10 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-(x)-(x)-(x)-(x)-(x)-(x)-(x)-(x)-(x)-' => self::GRASS,
        ],
        11 => [
            // alternating ox means the xs in other rows will be grass
            '-(x)-(x)-(x)-(x)-(x)-(x)-(x)-(x)-(x)-(x)-(x)-' => self::GRASS,
        ],
    ];

    public function __construct(string $input) {
        $lines = array_map('trim', explode("\n", $input));

        foreach($lines as $row => $l) {
            if ($row === 0) {
                $this->colCounts = str_split($l);
                $this->numCols = count($this->colCounts);
                continue;
            }

            // if the input is just ..x but there are more empty spaces to the right, pad it
            $l = str_pad($l, $this->numCols+1, self::INPUT_UNKNOWN);

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

        $this->numRows = count($this->rowCounts);
    }

    public function setDebug(bool $debug): void
    {
        $this->debug = $debug;
    }

    public function setOutputLevel(int $level): void
    {
        $this->outputLevel = $level;
    }

    public function setLineEnding(string $ending): void
    {
        $this->lineEnding = $ending;
    }

    public function setGridReturnType(string $type): void
    {
        $this->gridReturnType = $type;
    }

    /**
     * Run the solver!
     */
    public function solve(bool $outputSolution = false): int|bool
    {
        $changed = true;

        $loop = 0;
        while ($changed && $this->tentCount !== $this->treeCount && $loop < 8) {
            $changed = false;
            $loop++;

            if ($this->debug) {
               $this->print('loop ' . $loop);
            }

            if ($this->debug) {
               $this->print('fillGrass');
            }
            $changed = $this->fillGrass() || $changed;
            if ($this->debug) {
                $this->printGrid();
            }

            if ($this->debug) {
               $this->print('fillCols');
            }
            $changed = $this->fillCols() || $changed;
            if ($this->debug) {
                $this->printGrid();
            }

            if ($this->debug) {
               $this->print('fillRows');
            }
            $changed = $this->fillRows() || $changed;
            if ($this->debug) {
                $this->printGrid();
            }

            if ($this->debug) {
               $this->print('markCornerGrass');
            }
            $changed = $this->markCornerGrass() || $changed;
            if ($this->debug) {
                $this->printGrid();
            }

            if ($this->debug) {
               $this->print('findLastTreesTents');
            }
            $changed = $this->findLastTreesTents() || $changed;
            if ($this->debug) {
                $this->printGrid();
            }

            if ($this->debug) {
               $this->print('patternMatchRows');
            }
            $changed = $this->patternMatchRows() || $changed;
            if ($this->debug) {
                $this->printGrid();
            }

            if ($this->debug) {
               $this->print('patternMatchCols');
            }
            $changed = $this->patternMatchCols() || $changed;
            if ($this->debug) {
                $this->printGrid();
            }

            $changed = $this->pairTrees() || $changed;
            $changed = $this->pairTents() || $changed;

            // $this->printGrid();
            $this->validate();
        }

        // $changed = $this->patternMatchRows() || $changed;


        if ($this->debug || $outputSolution) {
            if ($this->gridReturnType === 'json') {
                // output just the tents - can probably just check the pairs!
                @header('Content-Type: application/json; charset=UTF-8');

                $success = $this->tentCount === $this->treeCount;

                $tents = [];
                foreach($this->getAllCells(self::TENT) as $d) {
                    list($x, $y, $cell) = $d;

                    $tents[] = [
                        'x' => $x,
                        'y' => $y,
                    ];
                }

                echo json_encode(['tents' => $tents, 'success' => $success]);

                exit;
            } else {
                // print the full grid
            $this->printGrid();
        }
        }

        if ($changed && $this->tentCount === $this->treeCount) {
            if ($this->debug) {
               $this->print('SOLVED SOLVED SOLVED!!!');
            }
            return $loop;
        } else {
            if ($this->debug) {
               $this->print('~~~~~ NOT SOLVED ~~~~~ maybe additional patterns need to be implemented?');
            }
        }

        if ($this->debug) {
           $this->print('num trees: ' . $this->treeCount);
           $this->print('num tents: ' . $this->tentCount);
           $this->print('num loops: ' . $loop);
           $this->print('changed: ' . ($changed ? 'yes' : 'no'));
           $this->print('tent/tree counts match: ' . ($this->tentCount === $this->treeCount ? 'yes' : 'no'));
        }

        return false;
    }

    /**
     * @return bool whether or not any map values changed as a result of this function
     */
    private function fillGrass(): bool
    {
        $changed = false;

        // check each cell
        foreach($this->getAllCells(self::UNKNOWN) as $d) {
            list($x, $y, $cell) = $d;

            $otherCells = $this->getAdjacentCells($x, $y);

            $above = $otherCells['above']['cell'];
            $below = $otherCells['below']['cell'];
            $left = $otherCells['left']['cell'];
            $right = $otherCells['right']['cell'];

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
    private function fillCols(): bool
    {
        $changed = false;

        // check each col
        foreach($this->colCounts as $x => $colCount) {
            // if column tent count is unknown, skip it
            if ($colCount === self::COL_ROW_UNKNOWN) {
                continue;
            }

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
    private function fillRows(): bool
    {
        $changed = false;

        // check each row
        foreach($this->rowCounts as $y => $rowCount) {
            // if row tent count is unknown, skip it
            if ($rowCount === self::COL_ROW_UNKNOWN) {
                continue;
            }

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
    private function findLastTreesTents(): bool
    {
        $changed = false;

        foreach($this->getAllCells(self::TREE) as $d) {
            list($x, $y, $cell) = $d;

            if ($this->isPaired($x, $y)) {
                continue;
            }

            $otherCells = $this->getAdjacentCells($x, $y, true);

            $counts = array_count_values(array_column($otherCells, 'cell'));

            // if there's only one remaining unknown, it has to be a tent
            if (
                (@$counts[self::TREE] + @$counts[self::GRASS] + @$counts[self::NOTHING]) === 3
                && @$counts[self::UNKNOWN] === 1
            ) {
                foreach($otherCells as $c) {
                    if ($c['cell'] === self::UNKNOWN) {
                        $changed = $this->markTent($c['x'], $c['y']) || $changed;
                        break;
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
     */
    private function getAdjacentCells(int $x, int $y, bool $considerPairsAsGrass = false): array
    {
        $above = $this->getCell($x, $y-1, $considerPairsAsGrass);
        $below = $this->getCell($x, $y+1, $considerPairsAsGrass);
        $left = $this->getCell($x-1, $y, $considerPairsAsGrass);
        $right = $this->getCell($x+1, $y, $considerPairsAsGrass);

        return [
            'above' => [
                'x' => $x,
                'y' => $y-1,
                'cell' => $above,
            ],
            'below' => [
                'x' => $x,
                'y' => $y+1,
                'cell' => $below,
            ],
            'left' => [
                'x' => $x-1,
                'y' => $y,
                'cell' => $left,
            ],
            'right' => [
                'x' => $x+1,
                'y' => $y,
                'cell' => $right,
            ],
        ];
    }

    private function getCell(int $x, int $y, bool $considerPairsAsGrass = false): string
    {
        $cell = $this->map[$y][$x] ?? '';

        // if this cell is a tree or tent and it's paired, consider it the same as grass
        if ($considerPairsAsGrass) {
            if (
                ($cell === self::TREE && $this->isPaired($x, $y))
                || ($cell === self::TENT && $this->isPaired($x, $y, self::TENT))
            ) {
                $cell = self::GRASS;
            }
        }

        return $cell;
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

    /**
     * Seach the paired trees/tents for this tree/tent
     */
    private function isPaired($x, $y, $type = self::TREE): bool
    {
        $key = $x.','.$y;

        if ($type === self::TREE) {
            return isset($this->pairs[$key]);
        } else if ($type === self::TENT) {
            return array_search($key, $this->pairs) !== false;
        }

    }

    private function setPaired($treeX, $treeY, $tentX, $tentY) {
        $this->pairs[$treeX.','.$treeY] = $tentX.','.$tentY;
    }

    // debugging
    private function printGrid() {
        $this->print('-----------');

        $currRow = '';
        foreach($this->getAllCells() as $d) {
            list($x, $y, $cell) = $d;

            // keep track of which row we're outputting and add a newline on new rows
            if ($currRow === '') {
                $currRow = $y;
            }

            if ($y !== $currRow) {
                $this->print('', true);
                // echo "<br>";
                $currRow = $y;
            }

            // output col #s
            if ($x === 0 && $y === 0) {
                $this->print('    ' . implode(' ', $this->colCounts), true);
                $this->print('    ' . implode(' ', range(0, $this->numCols-1)), true);
            }

            // output row #s
            if ($x === 0) {
                echo $this->rowCounts[$y] . ' ' . $y . ' ';
            }

            echo $cell . ' ';
        }

        $this->print('', true);

        if ($this->debug) {
            $this->print();
            $this->print("Tree->tent pairs (".count($this->pairs).")");
            foreach($this->pairs as $tree => $tent) {
                $this->print("$tree -> $tent");
            }
        }

       $this->print('-----------------------');
    }

    private function validate() {
        for($i=0; $i<$this->numCols; $i++) {
            // if column tent count is unknown, skip it
            if ($this->colCounts[$i] === self::COL_ROW_UNKNOWN) {
                continue;
            }

            $col = $this->getCol($i);

            // if the number of tents in this column is greater than the number expected
            if ($this->count($col, self::TENT) > $this->colCounts[$i]) {
                echo "ERROR ERROR ERROR col $i\n\n";
                $this->printGrid();
                die;
            }
        }

        for($i=0; $i<$this->numRows; $i++) {
            // if row tent count is unknown, skip it
            if ($this->rowCounts[$i] === self::COL_ROW_UNKNOWN) {
                continue;
            }

            $row = $this->getRow($i);

            // if the number of tents in this column is greater than the number expected
            if ($this->count($row, self::TENT) > $this->rowCounts[$i]) {
                echo "ERROR ERROR ERROR row $i\n\n";
                $this->printGrid();
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
    private function patternMatchRows(): bool
    {
        $changed = false;

        for($y=0; $y<$this->numRows; $y++) {
            // if column tent count is unknown, skip it
            if ($this->rowCounts[$y] === self::COL_ROW_UNKNOWN) {
                continue;
            }

            $row = $this->getRow($y);

            $remainingTents = $this->rowCounts[$y] - $this->count($row, self::TENT);

            if ($remainingTents < 0) {
                $this->print('ERROR TOO MANY TENTS in row ' . $y);
                die;
            }

            // for regex matching purposes, we only care about empty vs non-empty
            // so string replace everything that's not empty to a single value
            // (this also keeps the regex looking simpler)
            // e.g. " T ... ." should become "oxoxxxox"
            $rowString = implode('', $row);
            $rowString = str_replace([self::TREE, self::GRASS, self::TENT], self::PATTERN_KNOWN, $rowString); // x
            $rowString = str_replace(self::UNKNOWN, self::PATTERN_UNKNOWN, $rowString); // o

            foreach($this->patterns[$remainingTents] as $pattern => $type) {
                // set up the reversed pattern too
                $pattern = str_replace(self::PATTERN_UNKNOWN_INPUT, self::PATTERN_UNKNOWN, $pattern);

                // break the pattern into tokens so we can reverse the regex
                $matchedPattern = preg_match_all(self::PATTERN_REVERSE, $pattern, $patternMatches);
                if (!$matchedPattern) {
                    $this->print('REVERSE PATTERN NOT FOUND: '.$pattern);
                    die;
                }
                $reversePattern = implode('', array_reverse($patternMatches[0]));

                // match the pattern?
                $regex = self::PATTERN_PREFIX . $pattern . self::PATTERN_SUFFIX;
                $matched = preg_match($regex, $rowString, $matches, PREG_OFFSET_CAPTURE);

                $reverseRegex = self::PATTERN_PREFIX . $reversePattern . self::PATTERN_SUFFIX;
                $reverseMatched = preg_match($reverseRegex, $rowString, $reverseMatches, PREG_OFFSET_CAPTURE);

                foreach([$matches, $reverseMatches] as $key => $match) {
                    if (count($match) === 0) {
                        continue;
                    }

                    if ($this->debug) {
                        if ($key == 0) {
                            $this->print('REGULAR PATTERN MATCHED');
                            $this->print('   row: ' . $y);
                            $this->print('   rowString: ' . $rowString);
                            $this->print('   pattern: ' . $pattern);
                        } else {
                            $this->print('REVERSED PATTERN MATCHED');
                            $this->print('   row: ' . $y);
                            $this->print('   rowString: ' . $rowString);
                            $this->print('   reversePattern: ' . $reversePattern);
                        }
                    }

                    // $matches[x][1] is the byte offset in the string of the matched pattern (for a single pattern)

                    for($j=1; $j<count($match); $j++) {
                        $chars = str_split($match[$j][0]);
                        $x = $match[$j][1];

                        if ($type === self::GRASS) {
                            // loop over every matched character in case we need to mark multiple grasses
                            for($c=0; $c<count($chars); $c++) {
                                $changed = $this->mark($x+$c, $y-1, $type) || $changed;
                                $changed = $this->mark($x+$c, $y+1, $type) || $changed;
                            }
                        } else if ($type === self::TENT) {
                            $changed = $this->markTent($x, $y) || $changed;
                        }
                    }
                }
            }
        }

        return $changed;
    }

    /**
     * Match various patterns and add grass/tents as applicable
     */
    private function patternMatchCols(): bool
    {
        $changed = false;

        for($x=0; $x<$this->numCols; $x++) {
            // if column tent count is unknown, skip it
            if ($this->colCounts[$x] === self::COL_ROW_UNKNOWN) {
                continue;
            }

            $col = $this->getCol($x);

            $remainingTents = $this->colCounts[$x] - $this->count($col, self::TENT);

            if ($remainingTents < 0) {
                $this->print('ERROR TOO MANY TENTS in col ' . $x);
                die;
            }

            // for regex matching purposes, we only care about empty vs non-empty
            // so string replace everything that's not empty to a single value
            // (this also keeps the regex looking simpler)
            // e.g. " T ... ." should become "oxoxxxox"
            $colString = implode('', $col);
            $colString = str_replace([self::TREE, self::GRASS, self::TENT], self::PATTERN_KNOWN, $colString); // x
            $colString = str_replace(self::UNKNOWN, self::PATTERN_UNKNOWN, $colString); // o

            foreach($this->patterns[$remainingTents] as $pattern => $type) {
                // set up the reversed pattern too
                $pattern = str_replace(self::PATTERN_UNKNOWN_INPUT, self::PATTERN_UNKNOWN, $pattern);

                // break the pattern into tokens so we can reverse the regex
                $matchedPattern = preg_match_all(self::PATTERN_REVERSE, $pattern, $patternMatches);
                if (!$matchedPattern) {
                    $this->print('REVERSE PATTERN NOT FOUND: '.$pattern);
                    die;
                }
                $reversePattern = implode('', array_reverse($patternMatches[0]));

                // match the pattern?
                $regex = self::PATTERN_PREFIX . $pattern . self::PATTERN_SUFFIX;
                $matched = preg_match($regex, $colString, $matches, PREG_OFFSET_CAPTURE);

                $reverseRegex = self::PATTERN_PREFIX . $reversePattern . self::PATTERN_SUFFIX;
                $reverseMatched = preg_match($reverseRegex, $colString, $reverseMatches, PREG_OFFSET_CAPTURE);

                foreach([$matches, $reverseMatches] as $key => $match) {
                    if (count($match) === 0) {
                        continue;
                    }

                    if ($this->debug) {
                        if ($key == 0) {
                            $this->print('REGULAR PATTERN MATCHED');
                            $this->print('   col: ' . $x);
                            $this->print('   colString: ' . $colString);
                            $this->print('   pattern: ' . $pattern);
                        } else {
                            $this->print('REVERSED PATTERN MATCHED');
                            $this->print('   col: ' . $x);
                            $this->print('   colString: ' . $colString);
                            $this->print('   reversePattern: ' . $reversePattern);
                        }
                    }

                    // $matches[x][1] is the byte offset in the string of the matched pattern (for a single pattern)

                    for($j=1; $j<count($match); $j++) {
                        $chars = str_split($match[$j][0]);
                        $y = $match[$j][1];

                        if ($type === self::GRASS) {
                            // loop over every matched character in case we need to mark multiple grasses
                            for($c=0; $c<count($chars); $c++) {
                                $changed = $this->mark($x-1, $y+$c, $type) || $changed;
                                $changed = $this->mark($x+1, $y+$c, $type) || $changed;
                            }
                        } else if ($type === self::TENT) {
                            $changed = $this->markTent($x, $y) || $changed;
                        }
                    }
                }
            }
        }

        return $changed;
    }

    /**
     * Find all unpaired tents, and if they only have a single tree around them, pair it
     */
    private function pairTents(): bool
    {
        $changed = false;

        foreach($this->getAllCells(self::TENT) as $d) {
            list($x, $y, $cell) = $d;

            if ($this->isPaired($x, $y, self::TENT)) {
                continue;
            }

            $otherCells = $this->getAdjacentCells($x, $y, true);

            $counts = array_count_values(array_column($otherCells, 'cell'));

            // if there's only one tent around this and the others are grass, pair it to this tree
            if (
                (@$counts[self::TENT] + @$counts[self::GRASS] + @$counts[self::NOTHING]) === 3
                && @$counts[self::TREE] === 1
            ) {
                foreach($otherCells as $c) {
                    if ($c['cell'] === self::TREE) {
                        $changed = $this->setPaired($c['x'], $c['y'], $x, $y) || $changed;
                        break;
                    }
                }
            }
        }

        return $changed;
    }

    /**
     * Find all unpaired trees, and if they only have a single tent around them, pair it
     */
    private function pairTrees(): bool
    {
        $changed = false;

        foreach($this->getAllCells(self::TREE) as $d) {
            list($x, $y, $cell) = $d;

            if ($this->isPaired($x, $y)) {
                continue;
            }

            $otherCells = $this->getAdjacentCells($x, $y, true);

            $counts = array_count_values(array_column($otherCells, 'cell'));

            // if there's only one tent around this and the others are grass, pair it to this tree
            if (
                (@$counts[self::TREE] + @$counts[self::GRASS] + @$counts[self::NOTHING]) === 3
                && @$counts[self::TENT] === 1
            ) {
                foreach($otherCells as $c) {
                    if ($c['cell'] === self::TENT) {
                        $changed = $this->setPaired($x, $y, $c['x'], $c['y']) || $changed;
                        break;
                    }
                }
            }
        }

        return $changed;
    }

    /**
     * if a Tent can only be in 2 kitty-corner spots, then the space between those is grass
     */
    private function markCornerGrass(): bool
    {
        $changed = false;

        foreach($this->getAllCells(self::TREE) as $d) {
            list($x, $y, $cell) = $d;

            $otherCells = $this->getAdjacentCells($x, $y);

            $counts = array_count_values(array_column($otherCells, 'cell'));

            $above = $otherCells['above']['cell'];
            $below = $otherCells['below']['cell'];
            $left = $otherCells['left']['cell'];
            $right = $otherCells['right']['cell'];

            if (@$counts[self::UNKNOWN] === 2) {
                if ($above === self::UNKNOWN && $left === self::UNKNOWN) {
                    $changed = $this->mark($x-1, $y-1, self::GRASS) || $changed;
                } else if ($above === self::UNKNOWN && $right === self::UNKNOWN) {
                    $changed = $this->mark($x+1, $y-1, self::GRASS) || $changed;
                } else if ($below === self::UNKNOWN && $left === self::UNKNOWN) {
                    $changed = $this->mark($x-1, $y+1, self::GRASS) || $changed;
                } else if ($below === self::UNKNOWN && $right === self::UNKNOWN) {
                    $changed = $this->mark($x+1, $y+1, self::GRASS) || $changed;
                }
            }
        }

        return $changed;
    }

    public function print($input = '', $override = false) {
        if ($this->outputLevel === 0 && !$override) {
            return '';
        }

        if (is_bool($input)) {
            $input = $input ? 'true' : 'false';
        }

        echo $input . $this->lineEnding;
    }
}
