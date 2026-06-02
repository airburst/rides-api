# Reverse Proxy

## How to Configure Domain Masking in Caddy

For domain masking to work, you must first ensure that the DNS records for both domains (`abc.com` and `myhost.com`) point to your server's public IP address.

Here is how you handle both scenarios in your `Caddyfile`.

## The Subdomain Approach (Recommended)

In this setup, your internal service runs on a specific port (e.g., :8080), and you want both abc.myhost.com and the external masked domain abc.com to point to it seamlessly.

```bash
# Your internal/standard subdomain entry
abc.myhost.com {
  reverse_proxy localhost:8080
}

# The masked external domain mapping to the exact same service
abc.com {
  reverse_proxy localhost:8080
}
```

- Why this works: Caddy automatically provisions separate, free Let's Encrypt SSL/TLS certificates for both abc.myhost.com and abc.com. The visitor typing abc.com sees that URL in their browser bar, completely unaware of myhost.com.

## A Quick Note on "Local" Environments

If you are testing this strictly on a local network (not exposed to the public internet), Caddy cannot use Let's Encrypt to get a public SSL certificate for abc.com.

To make this work locally, you will need to:

1. Append .localhost to your testing domains (e.g., abc.localhost) so Caddy can use its internal self-signed CA.

2. Update your local machine's hosts file to map those domains to 127.0.0.1.

## Handling multiple subdomains

For a production application handling hundreds of dynamic subdomains and external custom domains, editing a static Caddyfile every time a user signs up is out of the question.

Caddy was practically built for this exact use case. You can manage this scale programmatically using two native features: On-Demand TLS (for custom external domains) and the Caddy Admin API (for total configuration control).

Here is how you scale this seamlessly in production.

1. Handling External Custom Domains: On-Demand TLS
   If a customer points abc.com to your server, Caddy needs to fetch an SSL certificate for it. If you tried to pre-configure hundreds of domains, Let's Encrypt would rate-limit you, and Caddy's startup time would crawl.

Instead, you use On-Demand TLS. When a user visits abc.com, Caddy intercepts the TLS handshake, asks your backend database if this domain belongs to a registered customer, and if it does, downloads an SSL certificate on the fly in under a second.

The Caddyfile Configuration

```bash
{
  # Global options
  on_demand_tls { # Caddy will send a GET request to this endpoint: /validate?domain=abc.com
  ask http://localhost:5000/validate-domain

        # Prevent abuse by limiting how many certs can be issued per minute
        interval 2m
        burst 5
  }
}

# Catch-all site block for HTTP/HTTPS
:443, :80 {
  tls {
    # Enable on-demand certificate generation for unknown domains
    on_demand
  }

  # Forward all traffic to your main application backend
  reverse_proxy localhost:8080 {
      # Pass the original host header so your app knows which domain wasrequested
      header_up Host {http.request.host}
  }

}
```

## Your Backend Responsibilities

You must build a simple HTTP endpoint (e.g., /validate-domain on port 5000) in your main application logic:

- Caddy will hit http://localhost:5000/validate-domain?domain=abc.com.

- If abc.com is in your database, return a 200 OK status code.

- If it isn't, return a 400/404 status code. Caddy will abort the connection immediately.

⚠️ Critical Security Warning: Never leave out the ask endpoint in production. Without it, an attacker could point thousands of random domains to your IP address, forcing Caddy to request certificates for them until your server runs out of disk space or you hit Let's Encrypt rate limits.

2. Handling Your Own Subdomains: Wildcard Routing
   For your own brand's subdomains (e.g., user1.myhost.com, user2.myhost.com), you don't even need the ask endpoint. You can handle them instantly using a wildcard block.

```bash
*.myhost.com {
    # Caddy can use the ACME DNS challenge (e.g., Cloudflare, Route53 plugin)
    # to get a single wildcard cert for all your subdomains.
    tls {
        dns cloudflare {env.CLOUDFLARE_AUTH_TOKEN}
    }

    reverse_proxy localhost:8080
}
```

Your backend application simply parses the Host header (user1.myhost.com) to serve the correct tenant data.

3. The Ultimate Control: Caddy's JSON Admin API
   If you need to change proxy rules entirely on the fly (e.g., routing userA to localhost:8080 but userB to a completely different server on 10.0.0.5), you can bypass the Caddyfile entirely and use Caddy's native JSON Admin API.

Caddy runs an administrative server locally (usually on port 2019). To add a new domain or change a proxy route programmatically, your app can send a standard HTTP payload:

```bash
curl localhost:2019/config/apps/http/servers/srv0/routes -X POST \
	-H "Content-Type: application/json" \
	-d @- <<EOF
{
  "match": [{"host": ["new-customer.com"]}],
  "handle": [{
    "handler": "reverse_proxy",
    "upstreams": [{"dial": "localhost:8081"}]
  }]
}
```

This updates Caddy's configuration in-memory zero-downtime, and Caddy automatically persists the configuration changes to disk so they survive a reboot.

## Validating external domains

TypeScript and Hono are an absolute dream combination for this. Hono’s ultra-low latency and small footprint make it perfect for edge cases, handling high-throughput routing, and responding to Caddy's TLS validation checks in milliseconds.

Here is how you implement the On-Demand TLS validation endpoint and multi-tenant domain parsing in a Hono application.

1. The Validation Endpoint for Caddy
   This is the endpoint Caddy will hit before issuing an SSL certificate. If a user tries to map customdomain.com, Caddy will make a background request to this Hono service.

```ts
import { Hono } from "hono";

const app = new Hono();

// Simulated Database Lookup
async function isDomainAllowed(domain: string): Promise<boolean> {
  // Replace this with your actual database query (Prisma, Drizzle, etc.)
  // e.g., return await db.tenant.findUnique({ where: { customDomain: domain } }) !== null
  const allowedDomains = ["abc.com", "my-client-site.org", "test-domain.dev"];
  return allowedDomains.includes(domain);
}

// Caddy On-Demand TLS "ask" endpoint
app.get("/validate-domain", async (c) => {
  const domain = c.req.query("domain");

  if (!domain) {
    return c.text("Domain query parameter missing", 400);
  }

  const allowed = await isDomainAllowed(domain);

  if (allowed) {
    console.log(`✅ TLS Certificate allowed for: ${domain}`);
    return c.text("OK", 200); // Caddy proceeds with SSL issuance
  }

  console.warn(`❌ TLS Certificate denied for: ${domain}`);
  return c.text("Not Allowed", 400); // Caddy drops the TLS handshake
});

export default app;
```

2. Handling the Dynamic Routing (Serving the Tenant)
   Once Caddy has accepted the domain and proxied the traffic to your app, your Hono application needs to look at the Host header to figure out which customer's data to serve.

You can handle both your own wildcards (tenant.myhost.com) and custom domains (abc.com) in a single Hono middleware or route handler:

```ts
// Middleware to resolve tenant based on the Host header
app.use("\*", async (c, next) => {
  const host = c.req.header("host") || ""; // e.g., "abc.com" or "user1.myhost.com"

  // 1. Strip port if present (e.g., localhost:8080 during dev)
  const cleanHost = host.split(":")[0];

  // 2. Determine if it's a subdomain or an external custom domain
  let tenantId: string | null = null;

  if (cleanHost.endsWith(".myhost.com")) {
    // Extract subdomain (e.g., "user1.myhost.com" -> "user1")
    tenantId = cleanHost.replace(".myhost.com", "");
  } else {
    // It's a custom domain, look up the tenant tied to this domain in your DB
    // tenantId = await db.tenant.findIdByDomain(cleanHost)
    if (cleanHost === "abc.com") tenantId = "user_abc_123";
  }

  if (!tenantId) {
    return c.text("Site not found", 404);
  }

  // Store the tenant ID in Hono's context so downstream routes can use it
  c.set("tenantId", tenantId);
  await next();
});

// Your actual application routes
app.get("/", (c) => {
  const tenantId = c.get("tenantId");
  return c.json({
    message: `Welcome to your dashboard!`,
    resolvedTenant: tenantId,
  });
});
```

## Production Deployment Architecture Tip

Because Hono can run anywhere, your deployment structure will look like this:

1. Caddy sits on the front line, listening on ports :80 and :443.

2. Your Hono App runs locally on a specific port (e.g., :8080) using Bun, Node.js, or Deno.

3. When a request comes in:

- Caddy checks Hono (:8080/validate-domain) to verify the SSL certificate if it's a new domain.

- Once validated, Caddy reverse-proxies all subsequent HTTP traffic to Hono (:8080).

- Hono parses the host header, extracts the tenantId, and queries your database for that user's specific content.
