# Doorbell picture-in-picture

A small native program for a rooted Samsung Tizen TV that shows a camera over whatever is on screen,
for example the front door when the doorbell rings. CleanFrame itself is a web app and cannot draw over
other apps, so this uses an EFL notification-level window, as Vetro's launcher does (window setup adapted
from Vetro, MIT, Copyright (c) 2026 Vetro contributors).

- Reads a go2rtc MJPEG stream on a background thread and shows the newest frame a few times a second.
- Appears only once it has a picture, in the top-right corner, inside a rounded frosted rim
  (`res/frame.png`, `res/mask.png`, made by `scripts/build-pip-art.mjs`).
- Takes the remote while it shows: any key (Back, OK or an arrow) closes it and the app underneath
  gets the remote back. Otherwise it closes after `--seconds` or when its `--stop` file appears.

## How it is started

The CleanFrame Vetro bridge (`vetro/cleanframe-art`) carries the build base64-encoded and unpacks it
to `pip/` beside its config. With `pip.stream` set in the bridge config, the bridge subscribes to
`vetro/cleanframe/doorbell` on the MQTT broker Vetro is configured for (reusing Vetro's saved login,
with its own client id). `ring` starts the overlay with `systemd-run --unit=cleanframe-pip`; `clear`
closes it early. Retained messages are ignored.

```json
{ "pip": { "stream": "http://192.168.1.2:1984/api/stream.mjpeg?src=doorbell_sub", "seconds": 30 } }
```

## Build

`npm run build:pip` (needs a .NET SDK; targets the TV's .NET 6 runtime), then `npm run pack:art`.
Without a build the bridge works as before and simply has no PiP to start.
