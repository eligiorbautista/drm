# License Delivery Authorization

This page provides the technical specifications and implementation
details for license delivery authorization. It covers the API contracts,
JWT token structure, authorization callback interface, and configuration
options for both authorization methods. For an overview of the security
concepts and architecture patterns, see Core Security Concepts.

When a user triggers a license request, your backend must provide a
Customer Rights Token to DRMtoday. This token defines whether the user
is allowed to receive a license and which parameters the license should
have. Without the token DRMtoday will not issue a license.

The Customer Rights Token can be provided with:

-   Token Authorization (the preferred method)
-   Callback Authorization

These methods can be combined, see Fallback authorization for
transitioning between those two modes.

There are two additional modes for testing and specialty use cases:

-   Allow all requests for specific use cases that do not require
    individual authorization
-   Test dummy for testing and service integration

You can configure the authorization method in the dashboard or via the
API.

## Token Authorization

Token authorization uses authorization tokens for license delivery
authorization. Authorization tokens are based on the JSON Web Token
(JWT) standard as defined in RFC 7519.

The authorization token has to be provided in the `x-dt-auth-token`
header of the license request.

### Shared secrets

The tokens are signed with a shared secret between your backend and
DRMtoday which can be configured in the dashboard or the configuration
API.

The shared secret should be randomly generated. We recommend using a
secret with 32 bytes (represented as a 64 bytes hex string in the
dashboard).

Multiple shared secrets can be added to support rotation. The shared
secret used to sign the token is identified by the `kid` claim in the
token.

### Supported algorithms

DRMtoday supports HS256, HS384, and HS512. HS256 is recommended.

### Mandatory JWT header parameters

-   `alg`
-   `kid`
-   `typ` (always JWT)

### JWT payload claims

-   `jti` (required)
-   `iat` (required)
-   `exp` (optional)
-   `optData` (required)
-   `crt` (required)

### Code example (Python)

``` python
import jwt
import uuid
import json
import datetime
import codecs
# Example omitted for brevity
```

## Callback Authorization

With callback authorization, DRMtoday issues a request to your backend.

### JSON POST Request Callback

A POST request is sent to the configured callback URL with a JSON body
containing request details.

### Callback Response

DRMtoday expects a valid Customer Rights Token as response.

## Fallback authorization

DRMtoday first attempts token authorization, then falls back to callback
authorization if no token is provided.

## Allow all requests

Intended only for special use cases. Consult DRMtoday support before
using.

## Test dummy

Intended only for testing and service integration.

Example:

``` json
{
  "merchant": "organizationApiName",
  "userId": "xyz",
  "sessionId": "crtjson:{\"ref\":[\":crt_template_id\"],\"profile\":{\"rental\":{\"relativeExpiration\":\"PT10M\", \"playDuration\":\"PT1M\"}}}"
}
```
