<?php

// TODO: update this with the puzzle input
$input = 1234;
// $input = 8632;

$input = str_pad($input, 4, '0', STR_PAD_LEFT);

// $input = [2, 7, 8, 2];
$inputs = pc_permute(str_split($input));

foreach($inputs as $key => $i) {
  $signs = getSigns($key);

  foreach($signs as $s) {
    $eq = [];

    $eq[] = $i[0] . $s[0] . $i[1] . $s[1] . $i[2] . $s[2] . $i[3];
    $eq[] = '(' . $i[0] . $s[0] . $i[1] . ')' . $s[1] . $i[2] . $s[2] . $i[3];
    $eq[] = '(' . $i[0] . $s[0] . $i[1] . $s[1] . $i[2] . ')' . $s[2] . $i[3];
    $eq[] = $i[0] . $s[0] . '(' . $i[1] . $s[1] . $i[2] . ')' . $s[2] . $i[3];
    $eq[] = $i[0] . $s[0] . '(' . $i[1] . $s[1] . $i[2] . $s[2] . $i[3] . ')';
    $eq[] = $i[0] . $s[0] . $i[1] . $s[1] . '(' . $i[2] . $s[2] . $i[3] . ')';

    foreach($eq as $equation) {
      // echo $equation . "\n";

      $temp = calc($equation);

      if ($temp == 10 ) {
        getSymbols($equation);
        getHint($equation);
        getHint2($equation);
        echo 'solution: ' . $equation . "\n";
        echo "\n";
      }
    }
  }

}

function calc($eq) {
  try {
    $temp = @eval('return '.$eq.';');
  } catch (Exception $e) {
    $temp = false;
  } catch (DivisionByZeroError $e) {
    $temp = false;
  }

  return $temp;
}

function getSymbols($e) {
  // or get symbols
  $symbols = preg_replace("/[\d\(\)]/", '', $e);
  $symbols = implode('', array_unique(str_split($symbols)));
  echo "symbols used: $symbols\n";
}

function getHint($e) {
  if (strpos($e, '(') !== false) {
    // split by ( or ), eval [0]
    $openPos = strpos($e, '(');
    $closePos = strpos($e, ')');
    $e = substr($e, $openPos + 1, $closePos - $openPos - 1);
    $temp = calc($e);
    // "using 2 or 3 digits"
    $numNums = strlen($e) == 3 ? 2 : 3;
    echo "hint: calculate $temp with parens using $numNums numbers\n";
  } else {
    // get first 3 characters and eval
    $e = substr($e, 0, 3);
    $temp = calc($e);
    echo "hint: calculate $temp without parenthesis\n";
  }
}

function getHint2($e) {
  if (strpos($e, '(') !== false) {
    // split by ( or ), eval [1]
    $openPos = strpos($e, '(');
    $closePos = strpos($e, ')');
    $e = substr($e, $openPos + 1, $closePos - $openPos - 1);
    $temp = calc($e);
    echo "hint2: figure this out... \n";
    // figure out if it starts/ends in ()?
  } else {
    // get last 3 characters and eval
    $e = substr($e, 4, 3);
    $temp = calc($e);
    echo "hint2: calculate $temp without parenthesis\n";
  }
}

function getSigns($key) {
  $signs = ['+', '-', '*', '/'];
  $ret = [];

  for($i=0; $i<count($signs); $i++) {
    for($j=0; $j<count($signs); $j++) {
      for($k=0; $k<count($signs); $k++) {
        $ret[] = [$signs[$i], $signs[$j], $signs[$k]];
      }
    }
  }

  return $ret;

}


function pc_permute($items, $perms = array( )) {
    if (empty($items)) {
        $return = array($perms);
    } else {
        $return = array();
        for ($i = count($items) - 1; $i >= 0; --$i) {
             $newitems = $items;
             $newperms = $perms;
         list($foo) = array_splice($newitems, $i, 1);
             array_unshift($newperms, $foo);
             $return = array_merge($return, pc_permute($newitems, $newperms));
         }
    }
    return $return;
}