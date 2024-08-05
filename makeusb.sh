#!/bin/bash

usbpath=$1
devpath=$(ls /dev/disk/by-id/usb-* | grep -v '\-part.*$')
iso=$(ls ./out/ | grep '.iso')

if [[ "$1" == "" ]]; then
    clear
    echo "Usage: ./makeusb.sh [DEVICE]"
    echo ''
    echo "Here are your current connected USB devices:"
    echo -e '\e[1;38;5;33m'"$devpath"'\e[0m'
    echo ''
    exit
else
    echo -e "\e[1;38;5;93mISO Name:          "'\e[1;38;5;33m'"$iso"
    echo -e "\e[1;38;5;93mDestination Drive: "'\e[1;38;5;33m'"$1"'\e[0m'

    sudo dd bs=4M if=out/$iso of="$1" conv=fsync oflag=direct status=progress
fi

