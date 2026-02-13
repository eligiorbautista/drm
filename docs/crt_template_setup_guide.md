# CRT Template Setup Guide

This guide explains how to configure DRMtoday CRT Templates for Enhanced Output Protection that works with ALL DRM schemes including Widevine L3, PlayReady, and FairPlay.

## Why Use CRT Templates?

The simple `enforce: true` approach has limitations:
- Software CDMs (Widevine L3, PlayReady, FairPlay web) cannot enforce HDCP
- Results in `output-restricted` license status and playback failure
- No control over HDCP levels per content quality

**CRT Templates with Enhanced Output Protection solve this:**
- Use `requireHDCP` instead of `enforce`
- Set `HDCP_NONE` for software CDMs - license granted without HDCP
- Set `HDCP_V1`, `HDCP_V2` for hardware-secure devices based on resolution
- Works with all DRM schemes through selective overrides

## Required Templates

Create these templates in the DRMtoday dashboard:

### 1. `template-hardware-secure`

For hardware-secure devices (Widevine L1, native FairPlay apps):

```json
{
  "profile": {
    "purchase": {}
  },
  "overrides": [
    {
      "sel": "hardware-secure-selector",
      "crt": {
        "op": {
          "config": {
            "UHD": {
              "WidevineM": {
                "requireHDCP": "HDCP_V2"
              },
              "PlayReadyM": {
                "requireHDCP": "HDCP_V2"
              },
              "FairPlayM": {
                "requireHDCP": "HDCP_V2"
              }
            },
            "HD": {
              "WidevineM": {
                "requireHDCP": "HDCP_V1"
              },
              "PlayReadyM": {
                "requireHDCP": "HDCP_V1"
              },
              "FairPlayM": {
                "requireHDCP": "HDCP_V1"
              }
            },
            "SD": {
              "WidevineM": {
                "requireHDCP": "HDCP_NONE"
              },
              "PlayReadyM": {
                "requireHDCP": "HDCP_NONE"
              },
              "FairPlayM": {
                "requireHDCP": "HDCP_NONE"
              }
            },
            "AUDIO": {
              "WidevineM": {
                "requireHDCP": "HDCP_NONE"
              },
              "PlayReadyM": {
                "requireHDCP": "HDCP_NONE"
              },
              "FairPlayM": {
                "requireHDCP": "HDCP_NONE"
              }
            }
          }
        }
      }
    }
  ]
}
```

**Selector definition in template:**
```json
{
  "selectors": [
    {
      "name": "hardware-secure-selector",
      "drmScheme": ["WIDEVINE_MODULAR"],
      "secLevel": ["1"]
    }
  ]
}
```

### 2. `template-software-cdm`

For software CDMs (Widevine L3, PlayReady web, FairPlay web):

```json
{
  "profile": {
    "purchase": {}
  },
  "overrides": [
    {
      "sel": "software-cdm-selector",
      "crt": {
        "op": {
          "config": {
            "UHD": {
              "WidevineM": {
                "requireHDCP": "HDCP_NONE",
                "allowRevokedDevice": true
              },
              "PlayReadyM": {
                "requireHDCP": "HDCP_NONE"
              },
              "FairPlayM": {
                "requireHDCP": "HDCP_NONE"
              }
            },
            "HD": {
              "WidevineM": {
                "requireHDCP": "HDCP_NONE"
              },
              "PlayReadyM": {
                "requireHDCP": "HDCP_NONE"
              },
              "FairPlayM": {
                "requireHDCP": "HDCP_NONE"
              }
            },
            "SD": {
              "WidevineM": {
                "requireHDCP": "HDCP_NONE"
              },
              "PlayReadyM": {
                "requireHDCP": "HDCP_NONE"
              },
              "FairPlayM": {
                "requireHDCP": "HDCP_NONE"
              }
            },
            "AUDIO": {
              "WidevineM": {
                "requireHDCP": "HDCP_NONE"
              },
              "PlayReadyM": {
                "requireHDCP": "HDCP_NONE"
              },
              "FairPlayM": {
                "requireHDCP": "HDCP_NONE"
              }
            }
          }
        }
      }
    }
  ]
}
```

**Selector definition in template:**
```json
{
  "selectors": [
    {
      "name": "software-cdm-selector",
      "drmScheme": ["WIDEVINE_MODULAR"],
      "secLevel": ["3"]
    },
    {
      "name": "software-cdm-selector",
      "drmScheme": ["PLAYREADY", "FAIRPLAY"]
    }
  ]
}
```

### 3. `template-default-cdm`

Fallback template for other DRM schemes:

```json
{
  "profile": {
    "purchase": {}
  },
  "overrides": [
    {
      "sel": "default-selector",
      "crt": {
        "op": {
          "config": {
            "UHD": {
              "*": {
                "requireHDCP": "HDCP_NONE"
              }
            },
            "HD": {
              "*": {
                "requireHDCP": "HDCP_NONE"
              }
            },
            "SD": {
              "*": {
                "requireHDCP": "HDCP_NONE"
              }
            },
            "AUDIO": {
              "*": {
                "requireHDCP": "HDCP_NONE"
              }
            }
          }
        }
      }
    }
  ]
}
```

**Selector definition:**
```json
{
  "selectors": [
    {
      "name": "default-selector",
      "drmScheme": ["OMADRM", "WISEPLAY"]
    }
  ]
}
```

## Backend Configuration

Update `/backend/src/routes/callback.js`:

```javascript
const TEMPLATE_IDS = {
  // Update these with your actual template IDs from DRMtoday dashboard
  HARDWARE_SECURE: 'your-template-uuid-here',
  SOFTWARE_CDM: 'your-template-uuid-here',
  DEFAULT: 'your-template-uuid-here',
};
```

## HDCP Values

| Value | Description | Use Case |
|-------|-------------|----------|
| `HDCP_NONE` | No HDCP required | Software CDMs, SD content |
| `HDCP_V1` | HDCP 1.4 required | Hardware L1, HD content |

## Content Quality Types

| Type | Resolution | Typical HDCP Req |
|------|-----------|-----------------|
| `UHD` | 4K/2160p | HDCP_V2 |
| `HD` | 720p/1080p | HDCP_V1 |
| `SD` | 480p | HDCP_NONE |
| `AUDIO` | Audio-only | HDCP_NONE |

## How It Works

1. **Callback receives** `drmScheme` and `secLevel` from DRMtoday
2. **Backend selects** appropriate template based on DRM scheme and security level
3. **DRMtoday applies** the template with Enhanced Output Protection
4. **License granted** with `requireHDCP` setting matching content quality
5. **CDM checks** device HDCP capability:
   - If `HDCP_NONE`: License works always
   - If `HDCP_V1+`: Device with HDCP support required

## Testing

Before creating templates, you can test with inline CRT (template reference not needed):

```javascript
// In backend callback response (temporary testing)
const crt = {
  ref: [":your-template-id"],
  assetId: asset
};
```

This allows verifying your template configuration works before integrating with the full selector logic.
