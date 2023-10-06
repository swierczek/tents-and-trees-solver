<?php

// TODO: update this with the puzzle input
$input = 6120;

$input = str_pad($input, 4, '0', STR_PAD_LEFT);

// $input = [2, 7, 8, 2];
$inputs = pc_permute(str_split($input.''));

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
      try {
        $temp = @eval('return '.$equation.';');
      } catch (Exception $e) {
        $temp = 0;
      } catch (DivisionByZeroError $e) {
        $temp = 0;
      }

      if ($temp == 10 ) {
        echo 'solution found: ' . $equation . "\n";
      }
    }
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
