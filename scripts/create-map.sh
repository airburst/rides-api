#!/bin/bash

source .env.local

# TODO: Setup credentials to authentication
# curl -s -X POST "https://$AUTH0_DOMAIN/oauth/token" \
#   -H "Content-Type: application/json" \
#   -d '{
#     "grant_type": "password",
#     "username": "you@example.com",
#     "password": "yourpassword",
#     "client_id": "yourClientId",
#     "audience": "'"$AUTH0_AUDIENCE"'"
#   }' | jq -r .access_token

curl -X POST http://localhost:3001/routes \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=Plain Sailing" \
  -F "gpx=@/Users/mark/Downloads/PlainSailing.gpx;type=application/gpx+xml"