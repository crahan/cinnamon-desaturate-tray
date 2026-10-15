# Desaturate Tray Icons

A Cinnamon extension that desaturates all system tray icons and adjusts their brightness and contrast.
Use it to make colored tray icons (for example 1Password or Electron apps) match a monochrome panel.

## Features

- Applies to icons from both tray applets:
  - `xapp-status@cinnamon.org`: StatusNotifier / XAppStatusIcon icons. Many of these send raw pixmap
    data, so an icon theme override cannot change them.
  - `systray@cinnamon.org`: legacy XEmbed tray icons.
- Adjustable desaturation, brightness and contrast.
- Optional: show the original colors while the pointer is over an icon.
- The effects apply to each icon, not to the panel containers, so the hover highlight keeps its color.
- New icons get the effects when they appear. Applets that reload after a panel layout change are found again.

## Requirements

Cinnamon 6.0, 6.2, 6.4 or 6.6.

## Installation

1. Copy the extension directory to your local extensions directory:

   ```bash
   cp -r desaturate-tray@crahan ~/.local/share/cinnamon/extensions/
   ```

   The directory name must be the same as the `uuid` in `metadata.json`.

2. Enable the extension in **System Settings → Extensions**.

   To enable it from a terminal, first show the list of enabled extensions:

   ```bash
   gsettings get org.cinnamon enabled-extensions
   ```

   Then set the list again with `'desaturate-tray@crahan'` added. For example, if no other extensions are enabled:

   ```bash
   gsettings set org.cinnamon enabled-extensions "['desaturate-tray@crahan']"
   ```

3. If Cinnamon does not load the extension, restart Cinnamon: push **Ctrl+Alt+Esc**, or push **Alt+F2**,
   type `r` and push **Enter**.

To install for all users, copy the directory to `/usr/share/cinnamon/extensions/` with `sudo`.

### Update

Disable the extension, replace the directory with the new version, then enable the extension again.
Your settings are kept in `~/.config/cinnamon/spices/desaturate-tray@crahan/`, so an update does not change them.

### Development

To test changes without a copy after each edit, use a symlink:

```bash
ln -s "$PWD/desaturate-tray@crahan" ~/.local/share/cinnamon/extensions/
```

Restart Cinnamon after each change. Look for errors in **Looking Glass** (Alt+F2, `lg`) or in
`~/.xsession-errors`.

## Settings

Open the settings from **System Settings → Extensions → Desaturate Tray Icons**.

| Setting                       | Range         | Default | Description                                            |
|-------------------------------|---------------|---------|--------------------------------------------------------|
| Desaturation                  | 0% to 100%    | 100%    | 0% keeps the original colors, 100% makes icons grey.   |
| Brightness                    | -100% to 100% | 0%      | Negative values make icons darker, positive lighter.   |
| Contrast                      | -100% to 100% | 0%      | Negative values decrease contrast, positive increase.  |
| Show original colors on hover | on / off      | off     | Remove all effects from an icon while hovered.         |

**Reset to defaults** sets all values back to their defaults.

## Uninstallation

1. Disable the extension in **System Settings → Extensions**.
2. Remove the directory:

   ```bash
   rm -r ~/.local/share/cinnamon/extensions/desaturate-tray@crahan
   ```

   If you installed a symlink, remove only the link. Do not add a trailing slash to the path.

3. Optional: remove the saved settings in `~/.config/cinnamon/spices/desaturate-tray@crahan/`.

## License

MIT. See [LICENSE](LICENSE).
