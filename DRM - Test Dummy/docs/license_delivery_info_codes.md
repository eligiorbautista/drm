# License Delivery Info Codes

In the following sections, you’ll find descriptions of various info codes that show up in the delivery logs dashboard and delivery log downloads.

---

## Informational Codes

For these codes, no action is required. They are just for your information.

### `UNAUTHORIZED_ASSETS`

Indicates that some of the requested assets were not authorized in the customer rights token.

### `UNUSED_ASSETS_IN_CRT`

Indicates that the customer rights token authorizes assets that were not requested in the license request.

---

## Legacy Usage Info Codes

Over the years, DRMtoday has introduced several changes, but our philosophy has always been to support as much as we can for as long as our customers need to adapt to the changes.

Most of our info codes serve the purpose to point out deprecated usage patterns. They help us internally to assess their usage, but also to inform you about the usage of deprecated features in your integration.

### `ACCOUNTING_ID_IN_USE`

The deprecated field `accountingId` is used in the customer rights token.

### `ASSET_ID_OVERRIDE_IN_USE`

You are using the `assetId` query parameter. This query parameter is only intended for testing purposes and should not be used in production. The signaling information in the license request is sufficient to identify the requested keys.

### `AUTHTOKEN_KID_MISSING`

The `kid` parameter in the authorization token is missing.

### `AUTHTOKEN_MULTIPLE_VALUES`

You are using the `x-dt-auth-token` header and the `Authorization` header at the same time. Please only use `x-dt-auth-token`. The `Authorization` header is not supported yet.

### `CRT_STORE_LICENSE_MISSING`

The `storeLicense` field was missing in the customer rights token. The default value `true` is used. Please make your choice explicit by adding the field.

### `CRT_UNSUPPORTED_FIELD`

The customer rights token contains an unsupported field. The detail field of the info contains the field name.

### `CSL_NOT_PURCHASED`

Concurrent stream limiting was not purchased but is used in the customer rights token. Please remove the `csl` field from the customer rights token.

### `CUSTDATA_MULTIPLE_VALUES`

The custom data was provided in multiple locations. For example, in multiple headers or because an authorization token was provided and a custom data header was sent in the same request. This is not necessary anymore. Please always only use either the `x-dt-custom-data` or the `x-dt-auth-token` header in the request, but not both.

### `FP_PLAIN_ASSET_ID`

You are sending the `assetId` as a plain string without the SKD URL encoding as described in *License Request*. This can lead to ambiguities. Please use the SKD URL encoding instead.

### `HEADER_MULTIPLE_VALUES`

A header was sent multiple times. The detail field of the info contains the header name. Please send these headers only once in your license requests.

### `HEADER_VALUE_BLANK`

You are sending a header with a blank value. The detail field of the info contains the header name. Please remove these headers from your license requests.

### `KEY_ID_OVERRIDE_IN_USE`

You are using the `keyId` query parameter for a DRM scheme other than ClearKey. This query parameter is only intended for testing purposes and should not be used in production.

The signaling information in the license request is sufficient to identify the requested keys.

### `LEGACY_HEADER`

The header `dt-custom-data` or `http-header-customdata` is used instead of `x-dt-custom-data` for sending the custom data.

### `LEGACY_PROFILE_STRUCTURE`

The deprecated profile structure is used. Please change the structure to the new one.

**Old example:**
```json
{
    "profile": {
        "purchase": {}
    }
}
```

**New example:**
```json
{
    "type": "purchase"
}
```

And similarly for the rental profile. See *profile* for details.

### `LEGACY_REQUEST_ID_HEADER`

You are using the legacy `x-dt-log-request-id` header instead of the `x-dt-request-id` header or `requestId` query parameter. Please use one of these two options instead. See *Request correlation* for details.

### `LEGACY_REQUEST_ID_PARAMETER`

You are using the legacy `logRequestId` query parameter instead of the `x-dt-request-id` header or `requestId` query parameter. Please use one of these two options instead. See *Request correlation* for details.

### `MALFORMED_REQUEST_ID_HEADER`

The `x-dt-request-id` query parameter contains a value that does not match this pattern: `[0-9A-Za-z-_]*` and was ignored. Please make sure to use a valid value for the `requestId` query parameter. See *Request correlation* for details.

### `MALFORMED_REQUEST_ID_PARAMETER`

The `requestId` query parameter contains a value that does not match this pattern: `[0-9A-Za-z-_]*` and was ignored. Please make sure to use a valid value for the `requestId` query parameter. See *Request correlation* for details.

### `MULTIPLE_REQUEST_ID_PARAMETERS`

You are sending multiple `requestId` query parameters. Please ensure that you only send one `requestId` query parameter in your license requests.

### `PLAYREADY_CREDENTIALS_FROM_BODY`

You are sending the custom data in the body of a PlayReady license request. If possible, please send the `x-dt-custom-data` header instead.

### `PLAY_DURATION_TOO_LONG`

The `profile.playDuration` is too long. The maximum duration is `2147483647` seconds.

### `QUERY_PARAM_MULTIPLE_VALUES`

A query parameter was sent multiple times. The detail field of the info contains the query parameter name. Please send these parameters only once in your license requests.

### `QUERY_PARAM_VALUE_BLANK`

You are sending a query parameter with a blank value. The detail field of the info contains the query parameter name. Please remove these parameters from your license requests.

### `QUERY_PARAM_VALUE_ILLEGAL_BOOLEAN`

You are sending a query parameter with an illegal boolean value. The detail field of the info contains the query parameter name. Please use `true` or `false` as values for these parameters.

### `QUERY_PARAM_VALUE_ILLEGAL_CASE`

You are sending a query parameter with an illegal uppercase or lowercase value. The detail field of the info contains the query parameter name.

### `UNEXPECTED_KEY_ID_QUERY_PARAM`

You are sending a `keyId` query parameter in your license request for a DRM scheme that does not support it. You can remove the query parameter without changing the behavior of the license request.

### `UNEXPECTED_QUERY_PARAMS`

You are sending unexpected query parameters. The detail field of the info contains the unexpected query parameter name. Please remove these parameters from your license requests.

### `VARIANT_ID_IN_USE`

The deprecated field `variantId` is used. The detail field of the info contains the location. Please do not use these fields anymore. Instead, concatenate the `assetId` and `variantId` in the `assetId` field using the `|` character as a separator. See *AssetId Changes* for details.

**Possible values for `location`:**

- `CRT` – The customer rights token
- `LIC` – As a `variantId` query parameter in the license request
- `FAIRPLAY` – The SDK URL for FairPlay license request contains the `variantId` parameter

In case of `FAIRPLAY`, the SKD URL is supposed to contain a `keyId` parameter as described in *License Request*.

