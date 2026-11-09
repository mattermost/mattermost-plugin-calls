# Calls v2: Kubernetes / Helm deployment (high availability)

Runs LiveKit on Kubernetes using LiveKit's upstream Helm chart plus the values and manifests in this directory, for use with the Mattermost Calls v2 plugin. Two or more LiveKit pods (one per node) share state through Redis, and signaling goes through an ingress with TLS. Optionally adds an in-cluster SIP bridge for outbound phone dialing.

Status legend: **[validated]** was run end to end on AWS; **[untested]** is written but not yet run.

## What gets deployed

| Component | How | Notes |
|---|---|---|
| LiveKit server | `livekit/livekit-server` chart 1.9.0, `values.yaml` | 2 replicas, `hostNetwork`, one pod per node |
| Redis | `redis.yaml` | Single in-cluster instance; use a managed Redis for production HA |
| Ingress + TLS | ingress-nginx, `ingress.yaml`; cert-manager (optional) | Signaling only; media does not go through the ingress |
| SIP bridge (optional) | `sip.yaml` | Outbound dialing; `hostNetwork` |

## Prerequisites

- A Kubernetes cluster (1.28+) with **at least two nodes that have public IP addresses**. LiveKit pods use the host network so clients can reach media ports on the node's public IP. Dedicate nodes to LiveKit with the label `role=calls` and the taint `calls=true:NoSchedule` (the values file expects this), plus at least one other node for ingress-nginx, Redis and cert-manager. `eks/cluster.yaml` is an example for Amazon EKS.
- `kubectl` and `helm` (v3.12+) with access to the cluster.
- A DNS name for LiveKit (for example `lk.example.com`). You will point it at the ingress load balancer in step 4.
- A TLS certificate for that name: either use cert-manager with Let's Encrypt (step 1), or provide your own `kubernetes.io/tls` Secret.
- A Mattermost server running the Calls v2 plugin, reachable over HTTPS from the cluster, and system admin access to it.
- Firewall / security group rules for the **LiveKit nodes**:

  | Port | Protocol | Purpose |
  |---|---|---|
  | 7882 | UDP | Media over UDP (preferred) |
  | 7881 | TCP | Media over TCP (fallback when UDP is blocked) |
  | 10000-10100 | UDP | Only if the SIP bridge is enabled (RTP media) |

  The ingress load balancer needs 443/tcp (and 80/tcp for certificate issuance). Do not open 7880, the signaling port, to the internet; it is reached through the ingress.

Sizing: for testing, small nodes are enough (the tested setup used `t3.small`). For production, give each LiveKit node plenty of CPU, because one pod uses the whole node (for example `c5.2xlarge` or larger, depending on call size), and raise the `resources` requests in `values.yaml` to match.

## 1. Install ingress-nginx and cert-manager **[validated]**

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo add livekit https://helm.livekit.io
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace
helm install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set crds.enabled=true
```

Skip cert-manager if you bring your own certificate.

## 2. Generate configuration **[validated]**

```bash
./setup.sh lk.example.com https://mattermost.example.com --acme-email you@example.com
```

Use `--tls-secret <name>` instead of `--acme-email` to use your own certificate Secret (create it in the `livekit` namespace first). Use `--redis <host:port>` for an external Redis, and `--sip` to generate the SIP bridge Secret. This writes `secrets.yaml` (mode 600, contains the API secret), `values-site.yaml`, `ingress.yaml` and, with ACME, `issuer.yaml`. Re-running keeps the existing secret.

## 3. Deploy **[validated]**

```bash
kubectl create namespace livekit
kubectl apply -f secrets.yaml
kubectl apply -f redis.yaml                 # skip if using an external Redis
kubectl apply -f issuer.yaml                # only with --acme-email
helm install livekit livekit/livekit-server --version 1.9.0 -n livekit \
  -f values.yaml -f values-site.yaml
kubectl apply -f ingress.yaml
kubectl -n livekit get pods -o wide         # two livekit-server pods on different nodes
kubectl -n livekit logs deploy/livekit-server --tail 20
```

LiveKit reads its config only at startup; after changing values, `helm upgrade` rolls the pods. Check the logs rather than relying on `Running`.

## 4. Open the media ports and create the DNS record **[validated]**

1. Allow 7882/udp and 7881/tcp (and 10000-10100/udp for SIP) on the LiveKit nodes' security group. On EKS, add the rules to the node group's security group.
2. Find the ingress address and create a DNS record for your LiveKit name pointing at it (CNAME for a hostname, A for an IP):
   ```bash
   kubectl -n ingress-nginx get svc ingress-nginx-controller
   ```
3. Wait for the certificate (`kubectl -n livekit get certificate`), then check `curl https://lk.example.com/` prints `OK`.

## 5. Configure the Calls plugin **[validated]**

In System Console > Plugins > Calls, set:

| Setting | Value |
|---|---|
| LiveKit URL | `wss://lk.example.com` |
| LiveKit API key | `calls-plugin` |
| LiveKit API secret | the value in `secrets.yaml` under `livekit-keys` |

## 6. Verify

**[validated: audio and screen share with two users over direct UDP, participants landing on both LiveKit pods, and TCP fallback. Upgrades are untested.]**

1. Start a call and join from a client outside the cluster's network. **[validated]**
2. Start several calls and confirm participants land on more than one LiveKit pod:
   ```bash
   for p in $(kubectl -n livekit get pods -l app.kubernetes.io/name=livekit-server -o name); do
     echo "== $p"; kubectl -n livekit logs $p | grep -E "starting RTC session|selected node for room" | tail -3
   done
   ```
3. Share a screen and confirm the other participant sees it. **[validated]**
4. UDP blocked (remove the 7882/udp rule), start a fresh call and confirm the selected candidate is `tcp4 ... :7881`. To print the selected candidates: `kubectl -n livekit logs <pod> | grep 'participant active' | grep -oE '\[(local|remote)\]\[selected:1\][^"]*'`. **[validated]**

## SIP outbound (optional)

**[validated: managed trunk and an outbound call to a phone with audio in both directions, using the in-cluster bridge]**

1. Generate with `--sip` (step 2) and apply `secrets.yaml` again.
2. Confirm Redis and LiveKit are running, then `kubectl apply -f sip.yaml`. The bridge runs on the host network of a `role=calls` node.
3. Open `10000-10100/udp` on that node.
4. In the plugin settings (SIP Outbound), enable outbound dialing, trunk mode **managed**, and enter your provider's trunk address, caller ID and credentials. Check `GET /plugins/com.mattermost.calls/sip/trunk-status`. If it reports `sip not connected (redis required)`, fix the cause and toggle **Enable outbound phone dialing** off and on; plain re-saves do not retry.

## Operations

- Logs: `kubectl -n livekit logs -f deploy/livekit-server`
- Upgrade: change `image.tag` (and the chart `--version`), then `helm upgrade`. **[untested]**
- Remove: `helm uninstall livekit -n livekit`, then `kubectl delete namespace livekit`.

## Troubleshooting

- **Certificate not issued:** `kubectl describe certificate -n livekit` and check DNS and port 80 reachability.
- **Calls start but no audio:** confirm 7882/udp and 7881/tcp are open on the nodes' security group, and that the nodes have public IPs.
- **LiveKit pods Pending:** each pod needs its own node with the `calls` label and taint.
- **LiveKit crash-loops:** it does not start if Redis is unreachable; check `livekit.redis.address`.
- **Pods stay `Pending` on small nodes:** a pod that does not fit shows `Insufficient memory` or `Too many pods` in `kubectl describe pod`. Small instances (such as `t3.small`) allow only about 11 pods per node and about 1.4 GB of allocatable memory, which a 1 GiB LiveKit request plus the SIP bridge exceeds. Use larger nodes, or lower the memory requests for a test.
- **Certificate stays `False`:** `kubectl -n livekit get challenge`. A `503` from the solver usually means the solver pod is `Pending` (see above); the ingress node group needs spare pod capacity.
- **EKS cluster creation fails with `maximum number of addresses has been reached`:** the default VPC setup creates a NAT gateway, which needs an Elastic IP. Free an address or set `vpc.nat.gateway: Disable` (nodes here are in public subnets anyway).
- **No call events in Mattermost:** LiveKit must reach `<site-url>/plugins/com.mattermost.calls/livekit-webhook`.

_Validated by the author on Amazon EKS with a human at the call-test checkpoints. Upgrades, recording and transcription are untested._
