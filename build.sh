#!/bin/bash
mkdir ~/Documents/Prevail/

sudo pacman -Syy

start=$(date +%s)

rm -rf /tmp/prevailiso
sudo rm -rf /tmp/prevailiso

clear
sudo ./mkprevailiso -v -w /tmp/prevailiso ./

echo -e "\e[1;38;5;93mRemoved Prevail Live ISO Temp Files\e[0m"
echo "Build Complete."

end=$(date +%s)
runtime=$((end-start))
minutes=$((runtime / 60))
seconds=$((runtime % 60))

echo -e "Build time: \e[0m$minutes minutes and $seconds seconds"

sudo rm -rf /tmp/prevailiso
