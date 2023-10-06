<?php

$yes = 0;
$no = 0;

for($c=1000; $c<=9999; $c++) {
  //$c = str_split($c.'');

  if (!solutionExists($c)) {
    $no++;
    //echo 'no solution for ' . $c . "\n";
  } else {
    $yes++;
  }
}

var_dump($yes);
var_dump($no);
die;

function solutionExists($input) {

  $i = str_split($input.'');
  $signs = getSigns();

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


      if ($temp == 10) {
        return true;
      }
    }
  }

  return false;
}

function getSigns() {
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