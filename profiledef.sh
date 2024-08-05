#!/usr/bin/env bash
# shellcheck disable=SC2034

iso_name="Prevail"
iso_label="Prevail"
iso_publisher="Prevail <https://prevail.purehavuk.com>"
iso_application="Prevail Live USB"
iso_version="$(date --date="@${SOURCE_DATE_EPOCH:-$(date +%s)}" +%Y.%m.%d)"
install_dir="arch"
buildmodes=('iso')
bootmodes=('uefi-x64.grub.esp' 'uefi-x64.grub.eltorito')
arch="x86_64"
pacman_conf="pacman.conf"
airootfs_image_type="squashfs"
airootfs_image_tool_options=('-comp' 'zstd' '-Xcompression-level' '15' '-b' '1M')
bootstrap_tarball_compression=(gzip -cn9)
file_permissions=(
  ["/etc/dconf/"]="0:0:755"
  ["/etc/locale.gen"]="0:0:644"
  ["/etc/profile.d/"]="0:0:644"
  ["/etc/os-installer"]="0:0:755"
  ["/etc/shadow"]="0:0:400"
  ["/etc/skel"]="0:0:755"
  ["/etc/sudoers"]="0:0:400"
  ["/etc/gshadow"]="0:0:400"
  ["/etc/sudoers.d"]="0:0:400"
  ["/root"]="0:0:750"
  ["/root/.automated_script.sh"]="0:0:755"
  ["/root/.gnupg"]="0:0:700"
  ["/usr/bin/geo_td"]="0:0:755"
  ["/usr/local/bin/"]="0:0:755"
  ["/usr/share/plymouth/themes/prevail/"]="0:0:755"
)
