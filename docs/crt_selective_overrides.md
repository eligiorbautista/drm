# CRT Selectors and Selective Overrides

A selector becomes active when **all of its provided properties have at
least one element matching**.\
In the example above:

-   **selector-1** matches for either of the two defined system IDs\
-   **selector-2** matches if the device platform is either *Windows* or
    *Linux* **and** the vulnerability level is either *high* or
    *critical*

## Use-case example

A selector for the **Widevine System ID** can be used together with the
Widevine property\
`allowRevokedDevice: true` in the override section to enable license
delivery even though a Widevine-specific CDM (Content Decryption Module)
version has been revoked.

See the example in the **CRT Overrides** chapter for more details.

## Values for Widevine Device Platform

  Value
  -------------
  CHROMECAST
  ANDROID
  WINDOWS
  CHROME_OS
  MAC_OS
  LINUX
  WEB_OS
  TIZEN
  FIRE_OS
  ROKU
  PLAYSTATION

## Values for Widevine Device Vulnerability Level

  Value
  -------------
  UNSPECIFIED
  NONE
  LOW
  MEDIUM
  HIGH
  CRITICAL

## CRT Selective Overrides

Customer Rights Token (CRT) templates support overriding a default
template for particular **CRT Selectors**.

Overrides can only be defined in CRT templates using the `overrides`
field.\
Templates referenced in the `ref` field of an override **must not**
contain additional selectors or overrides.

### Example

``` json
{
  "overrides": [
    {
      "sel": "selector-2",
      "crt": {
        "op": {
          "config": {
            "UHD": {
              "WidevineM": {
                "deny": true
              }
            },
            "HD": {
              "WidevineM": {
                "requireHDCP": "HDCP_V1",
                "allowRevokedDevice": true
              }
            },
            "SD": {
              "WidevineM": {
                "requireHDCP": "HDCP_NONE",
                "allowRevokedDevice": true
              }
            },
            "AUDIO": {
              "WidevineM": {
                "requireHDCP": "HDCP_NONE",
                "allowRevokedDevice": true
              }
            }
          }
        }
      }
    }
  ]
}
```

## Selector Override Fields

### overrides.sel

Name of a selector for which, if active, the override should be applied.

-   Can be a **single selector** or a **list of selectors**
-   The override is applied only if **all referenced selectors match**
-   A selector name can be prefixed with `!` to negate the condition

Example:

``` json
{
  "overrides": [
    {
      "sel": ["selector-1", "!selector-2"],
      "ref": "08ea6523-669b-4d26-8ec8-78be7589e407"
    }
  ]
}
```

In this example, the referenced CRT template is applied when:

-   `selector-1` **is active**
-   `selector-2` **is not active**

> For legacy configurations, this field has an alias named
> `overrides.selectors`.

### overrides.ref

A list (or single value) of references to CRT templates to be included
if the selector is active.

This acts as a shortcut for `overrides.crt.ref` and **cannot** be
combined with an inline CRT override.

Example:

``` json
{
  "overrides": [
    {
      "sel": "selector-2",
      "ref": "61a6a8d6-453c-41fc-b049-ca923fff638e"
    }
  ]
}
```

### overrides.crt.op

Custom **Enhanced Output Protection** settings applied when the selector
conditions are met.

All values provided override:

-   Standard Output Protection settings
-   Enhanced Output Protection settings
