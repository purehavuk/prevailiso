#!/usr/bin/env bash

set -o pipefail

declare -r workdir='/mnt'
declare -r osidir='/etc/os-installer'

## Generic checks
#
# Ensure user is in sudo group
for group in $(groups); do

	if [[ $group == 'wheel' || $group == 'sudo' ]]; then
		declare -ri sudo_ok=1
	fi

done

# If user is not in sudo group notify and exit with error
if [[ ! -n $sudo_ok ]]; then
	printf 'The current user is not a member of either the sudo or wheel group, this os-installer configuration requires sudo permissions\n'
	exit 1
fi

# Function used to quit and notify user or error
quit_on_err () {
	if [[ -n $1 ]]; then
		printf "$1\n"
	fi

	# Ensure console prints error
	sleep 2

	exit 1
}

detected_cpu=$(sudo lshw -C cpu | grep vendor | awk '{print $2}')
cpu_type_v3=$(/usr/lib/ld-linux-x86-64.so.2 --help | grep "x86-64-v3")
min_freq=$(lscpu | grep "CPU min MHz" | awk '{print $4}')
min_freq_khz=$(awk -v freq="$min_freq" 'BEGIN {print int(freq * 1000)}')
max_freq=$(lscpu | grep "CPU max MHz" | awk '{print $4}')
max_freq_khz=$(awk -v freq="$max_freq" 'BEGIN {print int(freq * 1000)}')
resume_id=$(blkid -o value -s UUID -l -t TYPE=swap)
hybrid_check=$(lspci | grep "VGA" | awk '{print $5}' | sort -u | wc -l)
graphics_check=$(lspci | grep 'VGA' | awk '{print $5}')
primary_grahics_check=$(lspci | grep "VGA" | awk '{print $5}' | sort -u | head -n 1)
dedicated_graphics_check=$(lspci | grep "VGA" | awk '{print $5}' | sort -u | tail -n 1)
primary_renderer_check=$(glxinfo | grep -oE "AMD|Intel" | head -n1)
nvme_check=$(blkid | grep 'nvme' | awk -F ':' '{print $1}' | head -n 1 | sed 's|/dev/||')
grub_cmd_default="loglevel=3 nowatchdog quiet splash lsm=landlock,lockdown,yama,integrity,apparmor,bpf acpi_enforce_resources=lax"

# sanity check that all variables were set
[[ -z ${OSI_LOCALE+x} ]] && quit_on_err 'OSI_LOCALE not set'
#[[ -z ${OSI_KEYBOARD_LAYOUT+x} ]] && quit_on_err 'OSI_KEYBOARD_LAYOUT not set' --- Disabled due to OSI bug
[[ -z ${OSI_DEVICE_PATH+x} ]] && quit_on_err 'OSI_DEVICE_PATH not set'
[[ -z ${OSI_DEVICE_IS_PARTITION+x} ]] && quit_on_err 'OSI_DEVICE_OS_PARTITION is not set'
[[ -z ${OSI_DEVICE_EFI_PARTITION+x} ]] && quit_on_err 'OSI_DEVICE_EFI_PARTITION is not set'
[[ -z ${OSI_USE_ENCRYPTION+x} ]] && quit_on_err 'OSI_USE_ENCRYPTION is not set'
[[ -z ${OSI_ENCRYPTION_PIN+x} ]] && quit_on_err 'OSI_ENCRYPT_PIN is not set'
[[ -z ${OSI_USER_NAME+x} ]] && quit_on_err 'OSI_USER_NAME is not set'
[[ -z ${OSI_USER_AUTOLOGIN+x} ]] && quit_on_err 'OSI_USER_AUTOLOGIN is not set'
[[ -z ${OSI_USER_PASSWORD+x} ]] && quit_on_err 'OSI_USER_PASSWORD is not set'
[[ -z ${OSI_FORMATS+x} ]] && quit_on_err 'OSI_FORMATS is not set'
[[ -z ${OSI_TIMEZONE+x} ]] && quit_on_err 'OSI_TIMEZONEFailed to configure locale.gen with en_US.UTF-8 is not set'
[[ -z ${OSI_ADDITIONAL_SOFTWARE+x} ]] && quit_on_err 'OSI_ADDITIONAL_SOFTWARE is not set'
[[ -z ${OSI_ADDITIONAL_FEATURES+x} ]] && quit_on_err 'OSI_ADDITIONAL_FEATURES is not set'

echo "LANG=\"$OSI_LOCALE\"" | sudo tee $workdir/etc/locale.conf || quit_on_err 'Failed to set default locale'

cpu_vender=$(lscpu | grep "Vendor ID:" | awk '{print $3}')
cpu_type_v3=$(/usr/lib/ld-linux-x86-64.so.2 --help | grep "x86-64-v3")

# CPU Microcode / Auto-CPUFreq
if [[ "$detected_cpu" == *'Intel'* ]]; then
    iommu_available="Yes"
    iommu_cpu="intel_iommu=on"
    sudo arch-chroot $workdir pacman -S --noconfirm intel-ucode intel-oneapi-mkl thermald
elif [[ "$detected_cpu" == *'AMD'* ]]; then
    iommu_available="Yes"
    iommu_cpu="amd_iommu=on"
    sudo arch-chroot $workdir pacman -S --noconfirm amd-ucode auto-epp
else
    iommu_available="No"
fi

sudo cp "$workdir/etc/prevail/installation_data/auto-cpufreq/auto-cpufreq.conf" "$workdir/etc/auto-cpufreq.conf"
sudo cp "$workdir/etc/prevail/installation_data/auto-cpufreq/auto-cpufreq.sh" "$workdir/etc/profile.d/"

if [ -f /sys/devices/system/cpu/intel_pstate/no_turbo ]; then
    turbo_available="yes"
else
    turbo_available="no"
fi

if [ -d "/sys/class/power_supply/BAT0" ]; then
    device_type="laptop"
else
    chassis_type=$(sudo dmidecode -s chassis-type 2>/dev/null)
    if [[ "$chassis_type" == *"Laptop"* ]] || [[ "$chassis_type" == *"Notebook"* ]]; then
        device_type="laptop"
    else
        device_type="desktop"
    fi
fi

if [ "$turbo_available" == "yes" ]; then
    sudo sed -i "s/^turbo = .*/turbo = auto/" "$workdir/etc/auto-cpufreq.conf"
else
    sudo sed -i "s/^turbo = .*/turbo = never/" "$workdir/etc/auto-cpufreq.conf"
fi

sudo cp "$workdir/etc/prevail/installation_data/auto-cpufreq/auto-cpufreq.conf" "$workdir/etc/auto-cpufreq.conf"
sudo cp "$workdir/etc/prevail/installation_data/auto-cpufreq/auto-cpufreq.sh" "$workdir/etc/profile.d/"

sudo sed -i "s/^scaling_min_freq = .*/scaling_min_freq = $min_freq_khz/" "$workdir/etc/auto-cpufreq.conf"
sudo sed -i "s/^scaling_max_freq = .*/scaling_max_freq = $max_freq_khz/" "$workdir/etc/auto-cpufreq.conf"
sudo sed -i "s/^energy_performance_preference = .*/energy_performance_preference = $epp_ac/" "$workdir/etc/auto-cpufreq.conf"
sudo sed -i "/\[battery\]/,/^energy_performance_preference = .*/s/^energy_performance_preference = .*/energy_performance_preference = $epp_battery/" "$workdir/etc/auto-cpufreq.conf"

# GRAPHICS
if [[ "$hybrid_check" == '2' && "$primary_renderer_check" == *'Intel'* && "$dedicated_graphics_check" == *'NVIDIA'* ]]; then
    hybrid_type="Intel/NVIDIA"
    grub_graphics="i915.enable_psr=0 i915.enable_rc6=3 module_blacklist=nouveau nvidia-drm.modeset=1"
    sudo arch-chroot $workdir pacman -R --noconfirm vulkan-radeon
    sudo arch-chroot $workdir pacman --noconfirm switcheroo-control
    sudo arch-chroot $workdir systemctl enable switcheroo-control
elif [[ "$hybrid_check" == '2' && "$primary_renderer_check" == *'AMD'* && "$dedicated_graphics_check" == *'NVIDIA'* ]]; then
    hybrid_type="AMD/NVIDIA"
    grub_graphics="amdgpu.dc=1module_blacklist=nouveau nvidia-drm.modeset=1"
    sudo arch-chroot $workdir pacman -R --noconfirm intel-media-driver
    sudo arch-chroot $workdir pacman --noconfirm switcheroo-control
    sudo arch-chroot $workdir systemctl enable switcheroo-control
elif [[ "$hybrid_check" == '1' && "$primary_grahics_check" == *'NVIDIA'* ]]; then
    hybrid_type="None"
    grub_graphics="module_blacklist=nouveau nvidia-drm.modeset=1"
    sudo arch-chroot $workdir pacman -R --noconfirm intel-media-driver vulkan-radeon
elif [[ "$hybrid_check" == '1' && "$primary_grahics_check" == *'AMD'* ]]; then
    hybrid_type="None"
    grub_graphics="amdgpu.dc=1"
    sudo arch-chroot $workdir pacman -R --noconfirm intel-media-driver nvidia-dkms nvidia-utils nvidia-prime nvidia-settings
elif [[ "$hybrid_check" == '1' && "$primary_grahics_check" == *'Intel'* ]]; then
    hybrid_type="None"
    grub_graphics="i915.enable_psr=0 i915.enable_rc6=3"
    sudo arch-chroot $workdir pacman -R --noconfirm intel-media-driver vulkan-radeon nvidia-dkms nvidia-utils nvidia-prime nvidia-settings
else
    hybrid_type="None"
fi

# RESOLUTION
current_res=$(gnome-randr | grep "*" | awk '{print $2}')

# STORAGE
if [[ $nvme_check == *"nvme"*"n"* ]]; then
    nvme_available="Yes"
	nvme_detected="nvme=yes"
else
	nvme_available="Yes"
fi

grub_cmdline="GRUB_CMDLINE_LINUX_DEFAULT='resume=UUID=$resume_id video=$current_res $grub_cmd_default $nvme_detected $grub_graphics $iommu_cpu'"

echo "Configuring GRUB..."
sudo cp "$workdir/etc/prevail/installation_data/default/grub" "$workdir/etc/default/grub"
sudo sed -i "s/^GRUB_CMDLINE_LINUX_DEFAULT=.*/$grub_cmdline/" "$workdir/etc/default/grub"
sudo sed -i "s/^GRUB_GFXPAYLOAD_LINUX=.*/GRUB_GFXPAYLOAD_LINUX=$current_res/" "$workdir/etc/default/grub"
sudo sed -i "s/^GRUB_THEME=.*/GRUB_THEME="/usr/share/grub/themes/prevail/theme.txt"/" "$workdir/etc/default/grub"
echo "Done."

# Install pacman.conf for ALHP x86-86-v3 repository
if [[ $cpu_type_v3 == 'x86-64-v3 (supported, searched)' ]]; then
	sudo cp "$workdir/etc/prevail/installation_data/pacman_v3.conf" "$workdir/etc/pacman.conf"
fi

# Install the kernel and updates
sudo arch-chroot $workdir pacman -Syy --noconfirm
sudo arch-chroot $workdir pacman -S --noconfirm linux-zen linux-zen-headers
sudo arch-chroot $workdir pacman -Syu --noconfirm

if [[ $OSI_USE_ENCRYPTION == 1 ]]; then
	sudo arch-chroot $workdir sed -i 's/^GRUB_ENABLE_CRYPTODISK=n$/GRUB_ENABLE_CRYPTODISK=y/' /etc/default/grub
	sudo cp $workdir/etc/prevail/installation_data/mkinitcpio/prevail_encrypt.conf $workdir/etc/mkinitcpio.conf.d/prevail.conf
	sudo cp $workdir/etc/prevail/installation_data/mkinitcpio/prevail.conf $workdir/etc/mkinitcpio.conf
	sudo arch-chroot $workdir mkinitcpio -P
else
	sudo cp /etc/prevail/installation_data/mkinitcpio/prevail.conf $workdir/etc/mkinitcpio.conf.d/prevail.conf
	sudo cp /etc/prevail/installation_data/mkinitcpio/prevail.conf $workdir/etc/mkinitcpio.conf
	sudo arch-chroot $workdir mkinitcpio -P
fi

# Install GRUB
sudo arch-chroot $workdir grub-install --target=x86_64-efi --efi-directory=/boot --bootloader-id=Prevail --removable
sudo arch-chroot $workdir grub-install --target=x86_64-efi --efi-directory=/boot --bootloader-id=Prevail
sudo arch-chroot $workdir grub-mkconfig -o /boot/grub/grub.cfg

# Get first name
declare firstname=($OSI_USER_NAME)
firstname=${firstname[0]}

# Remove Prevail user account and add new user, setup groups and set password
sudo arch-chroot $workdir sed -i '/^AutomaticLogin=prevail$/d' /etc/gdm/custom.conf
sudo arch-chroot $workdir userdel -r prevail
sudo arch-chroot $workdir useradd -m  -c "$OSI_USER_NAME" "${firstname,,}" || quit_on_err 'Failed to add user'
echo "${firstname,,}:$OSI_USER_PASSWORD" | sudo arch-chroot $workdir chpasswd || quit_on_err 'Failed to set user password'
sudo arch-chroot $workdir usermod -a -G wheel "${firstname,,}" || quit_on_err 'Failed to make user sudoer'

# Set root password
echo "root:$OSI_USER_PASSWORD" | sudo arch-chroot $workdir chpasswd || quit_on_err 'Failed to set root password'

# Set timezome
sudo arch-chroot $workdir ln -sf /usr/share/zoneinfo/$OSI_TIMEZONE /etc/localtime || quit_on_err 'Failed to set timezone'

# Remove NOPASSWD for wheel group
sudo sed -i 's/%wheel ALL=(ALL:ALL) NOPASSWD: ALL/%wheel ALL=(ALL:ALL) ALL/' $workdir/etc/sudoers.d/g_wheel

# Set custom keymap, very hacky but it gets the job done
# TODO: Also set in TTY
declare -r current_keymap=$(gsettings get org.gnome.desktop.input-sources sources)
printf "[org.gnome.desktop.input-sources]\nsources = $current_keymap\n" | sudo tee $workdir/etc/dconf/db/local.d/keymap || quit_on_err 'Failed to set dconf keymap'

# Set auto login if requested
if [[ $OSI_USER_AUTOLOGIN -eq 1 ]]; then
	printf "[daemon]\nAutomaticLoginEnable=True\nAutomaticLogin=${firstname,,}\n" | sudo tee $workdir/etc/gdm/custom.conf || quit_on_err 'Failed to setup automatic login for user'
fi

# Install extra packages
WINE_LIST="$workdir/etc/os-installer/bits/wine.list"

# Check if the package list file exists
if [[ ! -f "$WINE_LIST" ]]; then
    echo "Package list file not found: $WINE_LIST"
    exit 1
fi

while IFS= read -r package || [[ -n "$package" ]]; do
    if [[ ! -z "$package" ]]; then
        echo "Installing package: $package"
        sudo arch-chroot $workdir pacman -S --noconfirm "$package"
    fi
done < "$WINE_LIST"

sudo arch-chroot $workdir pacman -U --noconfirm /etc/prevail/installation_data/packages/heroic-games-launcher-2.14.1-1-x86_64.pkg.tar.zst

# Cleanup live functions
sudo arch-chroot $workdir pacman -R --noconfirm prevail-os-installer
sudo rm -rf $workdir/etc/prevail/
sudo rm -rf $workdir/etc/os-installer/
sudo rm $workdir/etc/xdg/autostart/network.desktop
sudo rm $workdir/usr/local/bin/network-check
sudo rm $workdir/usr/local/bin/prevail-avatar

sync
sudo umount -R /mnt

exit 0
