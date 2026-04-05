#!/bin/bash
echo "=== Ledger Device Detection ==="
echo ""

# Check USB
echo "1. USB Detection:"
LEDGER=$(lsusb 2>/dev/null | grep "2c97")
if [ -n "$LEDGER" ]; then
    echo "   ✓ Ledger found: $LEDGER"
else
    echo "   ✗ No Ledger found via USB"
    echo "   → Plug in your Ledger and unlock it"
    exit 1
fi

# Check HID raw devices
echo ""
echo "2. HID Raw Devices:"
for dev in /dev/hidraw*; do
    VENDOR=$(cat /sys/class/hidraw/$(basename $dev)/device/../../idVendor 2>/dev/null)
    if [ "$VENDOR" = "2c97" ]; then
        PERMS=$(ls -la $dev)
        echo "   ✓ Ledger HID: $dev"
        echo "     Permissions: $PERMS"
        # Check if current user can read
        if [ -r "$dev" ] && [ -w "$dev" ]; then
            echo "     ✓ Current user has read/write access"
        else
            echo "     ✗ Current user CANNOT access this device"
            echo "     → Run: sudo chmod 666 $dev"
            echo "     → Or add hidraw udev rule (see below)"
        fi
    fi
done

# Check udev rules
echo ""
echo "3. Udev Rules:"
if [ -f /etc/udev/rules.d/20-ledger.rules ]; then
    echo "   ✓ Ledger udev rules exist"
    if grep -q "hidraw" /etc/udev/rules.d/20-ledger.rules; then
        echo "   ✓ HIDRAW rules present"
    else
        echo "   ✗ Missing HIDRAW rules"
        echo "   → Need to add HIDRAW rules for Chrome WebHID to work"
    fi
else
    echo "   ✗ No Ledger udev rules found"
fi

# Check if Ledger Live is running
echo ""
echo "4. Conflicting Processes:"
if pgrep -f "ledger-live" > /dev/null 2>&1; then
    echo "   ⚠ Ledger Live is running — this can block access!"
    echo "   → Close Ledger Live and retry"
else
    echo "   ✓ No Ledger Live detected"
fi

# Summary and fix
echo ""
echo "=== Fix Commands ==="
echo ""
echo "Quick fix (temporary):"
for dev in /dev/hidraw*; do
    VENDOR=$(cat /sys/class/hidraw/$(basename $dev)/device/../../idVendor 2>/dev/null)
    if [ "$VENDOR" = "2c97" ]; then
        echo "  sudo chmod 666 $dev"
    fi
done
echo ""
echo "Permanent fix (add hidraw udev rule):"
echo '  echo '"'"'KERNEL=="hidraw*", ATTRS{idVendor}=="2c97", MODE="0666"'"'"' | sudo tee -a /etc/udev/rules.d/20-ledger.rules'
echo "  sudo udevadm control --reload-rules"
echo "  sudo udevadm trigger"
echo "  # Then unplug and replug the Ledger"
