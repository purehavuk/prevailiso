#!/usr/bin/env bash
#
# bin_steam.sh - launcher script for Steam on Linux
# Copyright Valve Corporation. All rights reserved
#
# This is the Steam script that typically resides in /usr/bin
# It will create the Steam bootstrap if necessary and then launch steam.

# verbose
#set -x

set -e

# Get the full name of this script
STEAMSCRIPT="$(cd "${0%/*}" && echo "$PWD")/${0##*/}"
export STEAMSCRIPT
bootstrapscript="$(readlink -f "$STEAMSCRIPT")"
bootstrapdir="$(dirname "$bootstrapscript")"

log () {
    echo "bin_steam.sh[$$]: $*" >&2 || :
}

export STEAMSCRIPT_VERSION=1.0.0.79

# Set up domain for script localization
export TEXTDOMAIN=steam

function show_message()
{
	style=$1
	shift

	case "$style" in
	--error)
		title=$"Error"
		;;
	--warning)
		title=$"Warning"
		;;
	*)
		title=$"Note"
		;;
	esac

	if [ "${XDG_CURRENT_DESKTOP}" == "gamescope" ]; then
		log "$title: $*"
		return
	fi

	if ! zenity "$style" --text="$*" 2>/dev/null; then
		# Save the prompt in a temporary file because it can have newlines in it
		tmpfile="$(mktemp || echo "/tmp/steam_message.txt")"
		echo -e "$*" >"$tmpfile"
		xterm -T "$title" -e "cat $tmpfile; echo -n 'Press enter to continue: '; read input"
		rm -f "$tmpfile"
	fi
}

function detect_platform()
{
	# Maybe be smarter someday
	# Right now this is the only platform we have a bootstrap for, so hard-code it.
	echo ubuntu12_32
}

function setup_variables()
{
	STEAMPACKAGE="${0##*/}"

	if [ "$STEAMPACKAGE" = bin_steam.sh ]; then
		STEAMPACKAGE=steam
	fi

	STEAMCONFIG=~/.steam
	STEAMDATALINK="$STEAMCONFIG/$STEAMPACKAGE"
	STEAMBOOTSTRAP=steam.sh
	LAUNCHSTEAMDIR="$(readlink -e -q "$STEAMDATALINK" || true)"
	LAUNCHSTEAMPLATFORM="$(detect_platform)"
	LAUNCHSTEAMBOOTSTRAPFILE="$bootstrapdir/bootstraplinux_$LAUNCHSTEAMPLATFORM.tar.xz"
	if [ ! -f "$LAUNCHSTEAMBOOTSTRAPFILE" ]; then
		LAUNCHSTEAMBOOTSTRAPFILE="/usr/lib/$STEAMPACKAGE/bootstraplinux_$LAUNCHSTEAMPLATFORM.tar.xz"
	fi

	# Get the default data path
	STEAM_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
	case "$STEAMPACKAGE" in
		steam)
			CLASSICSTEAMDIR="$HOME/Steam"
			DEFAULTSTEAMDIR="$STEAM_DATA_HOME/Steam"
			;;
		steambeta)
			CLASSICSTEAMDIR="$HOME/SteamBeta"
			DEFAULTSTEAMDIR="$STEAM_DATA_HOME/SteamBeta"
			;;
		*)
			log $"Unknown Steam package '$STEAMPACKAGE'"
			exit 1
			;;
	esac

	# Create the config directory if needed
	if [[ ! -d "$STEAMCONFIG" ]]; then
		mkdir "$STEAMCONFIG"
	fi
}

function install_bootstrap()
{
	STEAMDIR="$1"

	# Save the umask and set strong permissions
	omask="$(umask)"
	umask 0077

	log $"Setting up Steam content in $STEAMDIR"
	mkdir -p "$STEAMDIR"
	cd "$STEAMDIR"
	if ! tar xJf "$LAUNCHSTEAMBOOTSTRAPFILE" ; then
		log $"Failed to extract $LAUNCHSTEAMBOOTSTRAPFILE, aborting installation."
		exit 1
	fi
	ln -fns "$STEAMDIR" "$STEAMDATALINK"
	setup_variables

# Restore the umask
	umask "$omask"
}

function repair_bootstrap()
{
	rm -f "$STEAMDATALINK" && ln -s "$1" "$STEAMDATALINK"
	setup_variables
}

function check_bootstrap()
{
	if [[ -n "$1" && -x "$1/$STEAMBOOTSTRAP" ]]; then
		# Looks good...
		return 0
	else
		return 1
	fi
}

# Don't allow running as root
if [ "$(id -u)" == "0" ]; then
	show_message --error $"Cannot run as root user"
	exit 1
fi

# Look for the Steam data files
setup_variables

if ! check_bootstrap "$LAUNCHSTEAMDIR"; then
	# See if we just need to recreate the data link
	if check_bootstrap "$DEFAULTSTEAMDIR"; then
		log $"Repairing installation, linking $STEAMDATALINK to $DEFAULTSTEAMDIR"
		repair_bootstrap "$DEFAULTSTEAMDIR"
	elif check_bootstrap "$CLASSICSTEAMDIR"; then
		log $"Repairing installation, linking $STEAMDATALINK to $CLASSICSTEAMDIR"
		repair_bootstrap "$CLASSICSTEAMDIR"
	fi
fi

if [[ ! -L "$STEAMDATALINK" ]] || ( ! check_bootstrap "$LAUNCHSTEAMDIR" ); then
	install_bootstrap "$DEFAULTSTEAMDIR"
fi

if ! check_bootstrap "$LAUNCHSTEAMDIR"; then
	show_message --error $"Couldn't set up Steam data - please contact technical support"
	exit 1
fi

# go to the install directory and run the client
cp "$LAUNCHSTEAMBOOTSTRAPFILE" "$LAUNCHSTEAMDIR/bootstrap.tar.xz"
cd "$LAUNCHSTEAMDIR"

exec "$LAUNCHSTEAMDIR/$STEAMBOOTSTRAP" "$@"
