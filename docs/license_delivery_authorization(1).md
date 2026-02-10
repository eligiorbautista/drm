# License Delivery Authorization

This page provides the technical specifications and implementation
details for license delivery authorization. It covers the API contracts,
JWT token structure, authorization callback interface, and configuration
options for both authorization methods. For an overview of the security
concepts and architecture patterns, see Core Security Concepts.

## Overview

When a user triggers a license request, your backend must provide a
Customer Rights Token to DRMtoday. This token defines whether the user
is allowed to receive a license and which parameters the license should
have. Without the token DRMtoday will not issue a license.

The Customer Rights Token can be provided with:

-   Token Authorization (the preferred method), or
-   Callback Authorization.

These methods can be combined (Fallback authorization).

Additional modes:

-   Allow all requests
-   Test dummy

------------------------------------------------------------------------

## Token Authorization

Token authorization uses JWT tokens for license delivery authorization.

The authorization token must be provided in the `x-dt-auth-token` header
of the license request.

### Shared Secrets

-   Tokens are signed with a shared secret.
-   Recommended secret size: **32 bytes (64 hex characters)**.
-   Multiple shared secrets supported for rotation.
-   The `kid` claim identifies which secret was used.

### Supported Algorithms

-   HS256 (Recommended)
-   HS384
-   HS512

### Mandatory JWT Header Parameters

  Parameter   Description
  ----------- --------------------------
  alg         Algorithm (e.g. HS256)
  kid         Shared secret identifier
  typ         Always JWT

#### Header Example

``` json
{
  "alg": "HS256",
  "kid": "00000000-1111-2222-3333-444444444444",
  "typ": "JWT"
}
```

------------------------------------------------------------------------

## JWT Payload Claims

  Claim     Required   Description
  --------- ---------- -----------------------------------
  jti       Yes        Unique UUID for replay protection
  iat       Yes        Token creation time
  exp       No         Expiration time
  optData   Yes        Organization and user data
  crt       Yes        Customer Rights Token

### Payload Example

``` json
{
  "optData": "{"merchant":"organizationId","userId":"rental"}",
  "crt": "{"ref":[":template_id"],"assetId":"asset01","profile":{"type":"rental","relativeExpiration":"P7D","playDuration":"PT3H"}}",
  "iat": 1418985000,
  "exp": 1418988060,
  "jti": "89d42398-e156-4bd6-887f-b79993e50e2c"
}
```

------------------------------------------------------------------------

## Python Code Example

### Generate Token

``` python
import jwt
import uuid
import json
import datetime
import codecs

org_id = '00112233-4455-6677-8899-aabbccddeeff'
user_id = 'ffeeeedd-ccbb-aabb-9988-776655443322'

custom_data = {"merchant": org_id, "userId": user_id}
customer_rights_token = {'ref': [":shorts_r12h"], 'assetId': 'BBB_TEST'}

shared_secret_kid = '00000000-1111-2222-3333-444444444444'
shared_secret_value = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
shared_secret_bytes = codecs.decode(shared_secret_value, 'hex')

header_params = {"kid": shared_secret_kid}

now = datetime.datetime.now()
payload_claims = {
    "jti": str(uuid.uuid4()),
    "iat": int(now.timestamp()),
    "exp": int((now + datetime.timedelta(minutes=1)).timestamp()),
    "optData": json.dumps(custom_data),
    "crt": json.dumps(customer_rights_token),
}

token = jwt.encode(payload_claims, shared_secret_bytes, algorithm='HS256', headers=header_params)
print(token)
```

------------------------------------------------------------------------

## Callback Authorization

DRMtoday sends a callback request to your backend.

### JSON POST Request

    POST /callback
    Content-Type: application/json
    Accept: application/json

### Example Request Body

``` json
{
  "asset": "[assetId]",
  "variant": "[variantId]",
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
  },
  "requestMetadata": {
    "remoteAddr": "[remoteAddress]",
    "userAgent": "[userAgent]"
  }
}
```

### DRM Scheme Values

  ID                 Name
  ------------------ ---------------------
  FAIRPLAY           Apple FairPlay
  WIDEVINE_MODULAR   Google Widevine
  PLAYREADY          Microsoft PlayReady
  OMADRM             OMA DRM
  WISEPLAY           Huawei WisePlay

------------------------------------------------------------------------

## Callback Response

Example Purchase Response:

``` json
{
  "profile": {
    "type": "purchase"
  }
}
```

------------------------------------------------------------------------

## Custom Data Header

Provided via `x-dt-custom-data`.

### Example JSON

``` json
{
  "merchant": "123e4567-e89b-12d3-a456-426614174000",
  "sessionId": "RWFzdGVyZWdn",
  "userId": "00000000-1111-2222-3333-444444444444"
}
```

------------------------------------------------------------------------

## Fallback Authorization

-   DRMtoday first attempts Token Authorization.
-   If missing, it falls back to Callback Authorization.

------------------------------------------------------------------------

## Allow All Requests

⚠️ Only for special use cases.

Uses a CRT template for all license requests.

------------------------------------------------------------------------

## Test Dummy

⚠️ Only for testing.

Allows serialized CRT in sessionId:

``` json
{
  "merchant": "organizationApiName",
  "userId": "xyz",
  "sessionId": "crtjson:{\"ref\":[\":crt_template_id\"],\"profile\":{\"rental\":{\"relativeExpiration\":\"PT10M\",\"playDuration\":\"PT1M\"}}}"
}
```
