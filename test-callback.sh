#!/bin/bash

# Test script to verify Callback Authorization is working
# Run this from the project root

echo "========================================"
echo "Callback Authorization Verification"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if backend is running
echo "Test 1: Checking if backend is running..."
if curl -s http://localhost:8000/health | grep -q "ok"; then
    echo -e "${GREEN}✓ PASS${NC}: Backend is running"
else
    echo -e "${RED}✗ FAIL${NC}: Backend is not running on http://localhost:8000"
    echo "  Start backend with: cd drm-backend && npm run dev"
    exit 1
fi
echo ""

# Test 2: Test Widevine (Windows/Android)
echo "Test 2: Testing Widevine (Windows/Android) callback..."
WIDEVINE_RESPONSE=$(curl -s -X POST http://localhost:8000/api/callback \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "test-key",
    "user": "test-widevine-user",
    "session": "test-session-1",
    "client": "test-client-1",
    "drmScheme": "WIDEVINE_MODULAR",
    "clientInfo": {
      "manufacturer": "Chrome",
      "model": "Windows",
      "version": "100.0",
      "certType": "UNKNOWN",
      "drmVersion": "1.0",
      "secLevel": "3"
    },
    "requestMetadata": {
      "remoteAddr": "127.0.0.1",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  }')

if echo "$WIDEVINE_RESPONSE" | grep -q '"profile"'; then
    echo -e "${GREEN}✓ PASS${NC}: Widevine callback returns valid CRT"
    echo "$WIDEVINE_RESPONSE" | python3 -m json.tool | head -15
else
    echo -e "${RED}✗ FAIL${NC}: Widevine callback failed"
    echo "$WIDEVINE_RESPONSE"
fi
echo ""

# Test 3: Test FairPlay (iOS)
echo "Test 3: Testing FairPlay (iOS) callback..."
FAIRPLAY_RESPONSE=$(curl -s -X POST http://localhost:8000/api/callback \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "test-key",
    "user": "test-fairplay-user",
    "session": "test-session-2",
    "client": "test-client-2",
    "drmScheme": "FAIRPLAY",
    "clientInfo": {
      "manufacturer": "Apple",
      "model": "iPhone",
      "version": "17.0",
      "certType": "FPS_1_0",
      "drmVersion": "1.0",
      "secLevel": "0"
    },
    "requestMetadata": {
      "remoteAddr": "127.0.0.1",
      "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
    }
  }')

if echo "$FAIRPLAY_RESPONSE" | grep -q '"profile"'; then
    echo -e "${GREEN}✓ PASS${NC}: FairPlay callback returns valid CRT"
    echo "$FAIRPLAY_RESPONSE" | python3 -m json.tool | head -15
else
    echo -e "${RED}✗ FAIL${NC}: FairPlay callback failed"
    echo "$FAIRPLAY_RESPONSE"
fi
echo ""

# Test 4: Test PlayReady (Windows Edge)
echo "Test 4: Testing PlayReady (Windows Edge) callback..."
PLAYREADY_RESPONSE=$(curl -s -X POST http://localhost:8000/api/callback \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "test-key",
    "user": "test-playready-user",
    "session": "test-session-3",
    "client": "test-client-3",
    "drmScheme": "PLAYREADY",
    "clientInfo": {
      "manufacturer": "Microsoft",
      "model": "Edge",
      "version": "120.0",
      "certType": "UNKNOWN",
      "drmVersion": "4.1",
      "secLevel": "150"
    },
    "requestMetadata": {
      "remoteAddr": "127.0.0.1",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0"
    }
  }')

if echo "$PLAYREADY_RESPONSE" | grep -q '"profile"'; then
    echo -e "${GREEN}✓ PASS${NC}: PlayReady callback returns valid CRT"
    echo "$PLAYREADY_RESPONSE" | python3 -m json.tool | head -15
else
    echo -e "${RED}✗ FAIL${NC}: PlayReady callback failed"
    echo "$PLAYREADY_RESPONSE"
fi
echo ""

# Test 5: Check backend logs for callbacks
echo "Test 5: Checking backend logs for recent callbacks..."
RECENT_CALLBACKS=$(tail -20 /tmp/backend.log | grep -c "DRMtoday callback received" || echo 0)
if [ "$RECENT_CALLBACKS" -ge 3 ]; then
    echo -e "${GREEN}✓ PASS${NC}: Backend received $RECENT_CALLBACKS callback(s) in recent logs"
    echo "Recent callback logs:"
    tail -10 /tmp/backend.log | grep -A 5 "DRMtoday callback received" | tail -20
else
    echo -e "${YELLOW}⚠ WARN${NC}: Only $RECENT_CALLBACKS callback(s) in recent logs"
fi
echo ""

# Test 6: Verify frontend configuration
echo "Test 6: Verifying frontend .env configuration..."
if [ -f "drm-frontend/.env" ]; then
    if grep -q "VITE_DRM_MERCHANT=" drm-frontend/.env; then
        MERCHANT=$(grep "VITE_DRM_MERCHANT=" drm-frontend/.env | cut -d'=' -f2)
        echo -e "${GREEN}✓ PASS${NC}: Frontend has merchant configured: $MERCHANT"
    else
        echo -e "${RED}✗ FAIL${NC}: Frontend missing VITE_DRM_MERCHANT"
    fi
    
    if grep -q "VITE_DRM_BACKEND_URL=" drm-frontend/.env; then
        BACKEND_URL=$(grep "VITE_DRM_BACKEND_URL=" drm-frontend/.env | cut -d'=' -f2)
        echo -e "${GREEN}✓ PASS${NC}: Frontend has backend URL configured: $BACKEND_URL"
    else
        echo -e "${RED}✗ FAIL${NC}: Frontend missing VITE_DRM_BACKEND_URL"
    fi
    
    if grep -q "VITE_DRM_KEY_ID=" drm-frontend/.env; then
        KEY_ID=$(grep "VITE_DRM_KEY_ID=" drm-frontend/.env | cut -d'=' -f2)
        echo -e "${GREEN}✓ PASS${NC}: Frontend has KeyId configured: $KEY_ID"
    else
        echo -e "${RED}✗ FAIL${NC}: Frontend missing VITE_DRM_KEY_ID"
    fi
    
    if grep -q "VITE_DRM_IV=" drm-frontend/.env; then
        IV=$(grep "VITE_DRM_IV=" drm-frontend/.env | cut -d'=' -f2)
        echo -e "${GREEN}✓ PASS${NC}: Frontend has IV configured: $IV"
    else
        echo -e "${RED}✗ FAIL${NC}: Frontend missing VITE_DRM_IV"
    fi
else
    echo -e "${RED}✗ FAIL${NC}: Frontend .env file not found"
fi
echo ""

# Test 7: Verify backend configuration
echo "Test 7: Verifying backend .env configuration..."
if [ -f "drm-backend/.env" ]; then
    if grep -q "DRMTODAY_MERCHANT=" drm-backend/.env; then
        MERCHANT=$(grep "DRMTODAY_MERCHANT=" drm-backend/.env | cut -d'=' -f2)
        echo -e "${GREEN}✓ PASS${NC}: Backend has merchant configured: $MERCHANT"
    else
        echo -e "${RED}✗ FAIL${NC}: Backend missing DRMTODAY_MERCHANT"
    fi
    
    if grep -q "DRM_JWT_SHARED_SECRET=" drm-backend/.env; then
        SECRET=$(grep "DRM_JWT_SHARED_SECRET=" drm-backend/.env | cut -d'=' -f2)
        if [ ${#SECRET} -eq 128 ]; then
            echo -e "${GREEN}✓ PASS${NC}: Backend has JWT shared secret (64 hex chars, correct length)"
        else
            echo -e "${YELLOW}⚠ WARN${NC}: JWT shared secret length is ${#SECRET} chars (expected 128)"
        fi
    else
        echo -e "${YELLOW}⚠ WARN${NC}: Backend missing DRM_JWT_SHARED_SECRET (optional for Callback mode)"
    fi
    
    if grep -q "DRM_JWT_KID=" drm-backend/.env; then
        KID=$(grep "DRM_JWT_KID=" drm-backend/.env | cut -d'=' -f2)
        echo -e "${GREEN}✓ PASS${NC}: Backend has JWT KID configured: $KID"
    else
        echo -e "${YELLOW}⚠ WARN${NC}: Backend missing DRM_JWT_KID (optional for Callback mode)"
    fi
else
    echo -e "${RED}✗ FAIL${NC}: Backend .env file not found"
fi
echo ""

echo "========================================"
echo "Summary"
echo "========================================"
echo ""
echo "If all tests pass:"
echo "  1. Backend is correctly configured for Callback Authorization"
echo "  2. /api/callback endpoint is working"
echo "  3. CRT format is correct for all DRM schemes"
echo ""
echo "Next steps:"
echo "  1. Verify DRMtoday dashboard is configured for Callback mode"
echo "  2. Configure callback URL in DRMtoday: http://localhost:8000/api/callback"
echo "  3. Test with frontend: http://localhost:5173/watch?encrypted=true"
echo "  4. Check browser console for 'Callback Authorization' logs"
echo "  5. Check backend logs for 'DRMtoday callback received'"
echo ""
echo "For iOS support:"
echo "  1. Must use HTTPS (not HTTP)"
echo "  2. Upload FairPlay certificate to DRMtoday dashboard"
echo "  3. Configure public callback URL in DRMtoday"
echo ""
