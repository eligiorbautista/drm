# Client Information

When a client device requests a license from DRMtoday, information about
the device and its security capabilities is collected and made available
to your integration. This information can help you make authorization
decisions.

Client information is provided in two ways:

-   **Response header**: Returned as Base64 encoded JSON in the
    `x-dt-client-info` response header\
-   **Authorization callback**: Included in the Callback Authorization
    as the `clientInfo` structure

## Client Information Structure

The client information is represented as a JSON object with the
following fields:

  Property       Type     Description
  -------------- -------- ----------------------------------------------
  manufacturer   string   Device manufacturer
  model          string   Device model
  version        string   Device version
  drmVersion     string   Version of the DRM system reported by device
  secLevel       number   Security level reported by the device

You can use this information to make authorization decisions based on
device characteristics, manufacturer, model, or security level.

**Note:** Depending on DRM system and device, the information may be
more or less complete.

**Important:** The `secLevel` property differs from the `minSL` value
used in Enhanced Output Protection Settings.

## Security Level Values

### Widevine

  secLevel   Name          Description
  ---------- ------------- -----------------------------
  0          Unspecified   No specified security level
  1          L1            Hardware-based security
  2          L2            Software-based security
  3          L3            Software-based security

### PlayReady

  secLevel   Name      Description
  ---------- --------- ------------------------------------------------
  null       Unknown   Unknown security level
  150        SL150     PlayReady security level 150
  2000       SL2000    PlayReady security level 2000
  3000       SL3000    PlayReady security level 3000 (hardware-based)

**Note:** Some SL2000 devices support hardware security but cannot be
detected server-side.

### FairPlay

  secLevel   Name       Description
  ---------- ---------- ---------------------------------
  0          Baseline   Any FairPlay Streaming platform
  1          Main       Enhanced protection for 4K/HDR
  2          Audio      Audio-only FairPlay support

## Client Information in Response Header

Client information is returned as Base64 encoded JSON in the
`x-dt-client-info` response header.

To decode:

1.  Extract the header value\
2.  Base64 decode\
3.  Parse the resulting JSON

The decoded JSON follows the same structure as the Client Information
Structure.

## Client Information in Authorization Callback

When using callback authorization, client information is included in the
callback payload:

``` json
{
  "asset": "[assetId]",
  "user": "[userId]",
  "session": "[sessionId]",
  "client": "[clientId]",
  "drmScheme": "[drmScheme]",
  "clientInfo": {
    "manufacturer": "[manufacturer]",
    "model": "[model]",
    "version": "[version]",
    "certType": "[certType]",
    "drmVersion": "[drmVersion]",
    "secLevel": "[secLevel]"
  }
}
```

## Using Client Information for License Delivery Authorization

Client information enables device-level authorization decisions required
by studio regulations.

Common use cases include:

-   Enforcing minimum security levels
-   Device allowlisting or blocklisting
-   Studio-specific compliance rules

### Response header usage

The `x-dt-client-info` header can be used by:

-   **Authorization proxies** for logging or decision-making
-   **Client applications** for troubleshooting or feature gating

### Server-side authorization (callback)

When client information is received via Callback Authorization, your
backend can:

-   Inspect device characteristics\
-   Apply business and studio rules\
-   Return a valid Customer Rights Token or deny the request
