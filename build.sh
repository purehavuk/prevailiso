#!/bin/bash

sudo pacman -Syy

start=$(date +%s)

sudo rm -rf ./out && rm -rf /tmp/prevailiso-tmp
sudo rm -rf /tmp/prevailiso-tmp

clear
sudo ./mkprevailiso -v -w /tmp/prevailiso-tmp ./

echo -e "\e[1;38;5;93mRemoved Prevail Live ISO Temp Files\e[0m"
echo "Build Complete."

end=$(date +%s)
runtime=$((end-start))
minutes=$((runtime / 60))
seconds=$((runtime % 60))

echo -e "Build time: \e[0m$minutes minutes and $seconds seconds"
