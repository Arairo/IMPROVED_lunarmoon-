#!/bin/bash
# montage.sh out.jpg in1 in2 ... (2 columns)
out=$1; shift
args=(); f=""; i=0
for x in "$@"; do args+=(-i "$x"); f+="[$i]scale=640:-1[s$i];"; i=$((i+1)); done
rows=""; r=0
for ((k=0;k<i;k+=2)); do f+="[s$k][s$((k+1))]hstack[r$r];"; rows+="[r$r]"; r=$((r+1)); done
f+="${rows}vstack=inputs=$r"
ffmpeg -loglevel error -y "${args[@]}" -filter_complex "$f" "$out"
