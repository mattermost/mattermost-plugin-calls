# Calls v2: Kubernetes / Helm deployment (high availability)

Runs LiveKit on Kubernetes using LiveKit's upstream Helm chart plus the values and manifests in this directory, for use with the Mattermost Calls v2 plugin. Two or more LiveKit pods (one per node) share state through Redis, and signaling goes through an ingress with TLS. Optionally adds an in-cluster SIP bridge for outbound phone dialing.

Status legend: **[validated]** was run end to end on AWS; **[untested]** is written but not yet run.

## What gets deployed

| Component | How | Notes |
|---|---|---|
| LiveKit server | `livekit/livekit-server` chart 1.9.0, `values.yaml` | 2 replicas, `hostNetwork`, one pod per node |
| Redis | `redis.yaml` | Single in-cluster instance; use a managed Redis for production HA |
| Ingress + TLS | ingress-nginx, `ingress.yaml`; cert-manager (optional) | Signaling only; media does not go through the ingress |
| SIP bridge (optional) | `sip.yaml`, `sip-site.yaml` | Outbound dialing; `hostNetwork` |
| TURN relay (optional) | coturn on a separate host, see [External TURN](#external-turn-for-restrictive-firewalls-optional) | For clients that block UDP and plain TCP; not run in the cluster |

## Prerequisites

- A Kubernetes cluster (1.28+) with **at least two nodes that have public IP addresses**. LiveKit pods use the host network so clients can reach media ports on the node's public IP. Dedicate nodes to LiveKit with the label `role=calls` and the taint `calls=true:NoSchedule` (the values file expects this), plus at least one other node for ingress-nginx, Redis and cert-manager. `eks/cluster.yaml` is an example for Amazon EKS.
- `kubectl` and `helm` (v3.12+) with access to the cluster, and `openssl` (used by `setup.sh`). To create the example EKS cluster you also need `eksctl` and the `aws` CLI with a configured profile and region.
- Creating the example cluster: `eksctl create cluster -f eks/cluster.yaml` (about 15 minutes). It makes this cluster your current `kubectl` context. If you use an AWS profile, export `AWS_PROFILE` in every shell where you run `kubectl`, `helm` or `eksctl`.
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

Sizing: for testing, small nodes are enough (the tested setup used `t3.small`, with the small SIP requests in `sip.yaml`). For production, give each LiveKit node plenty of CPU, because one pod uses the whole node (for example `c5.2xlarge` or larger, depending on call size), and raise the `resources` requests in `values.yaml` to match.

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

Use `--tls-secret <name>` instead of `--acme-email` to use your own certificate Secret (create it in the `livekit` namespace first). Use `--redis <host:port>` for an external Redis, and `--sip` to generate the SIP bridge Secret and ConfigMap (`sip-site.yaml`, which carries the Redis address so `--redis` applies to the bridge too). This writes `secrets.yaml` (mode 600, contains the API secret), `values-site.yaml`, `ingress.yaml` and, with ACME, `issuer.yaml`. Re-running keeps the existing secret.

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

Until the media ports are open (step 4), the logs show `could not validate external IP` and `no external IPs found, using node IP`; both are expected at this point. `UDP receive buffer is too small` is also harmless for testing.

LiveKit reads its config only at startup; after changing values, `helm upgrade` rolls the pods. Check the logs rather than relying on `Running`.

## 4. Open the media ports and create the DNS record **[validated]**

1. Allow 7882/udp and 7881/tcp (and 10000-10100/udp for SIP) on the security group of the LiveKit nodes. On EKS, all managed node groups share the cluster security group, so the ports are also open on the other nodes, where nothing listens. Restrict the source range if your users' networks are known; `0.0.0.0/0` is the simplest:
   ```bash
   SG=$(aws ec2 describe-instances --filters Name=tag:eks:cluster-name,Values=<cluster-name> Name=instance-state-name,Values=running \
     --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' --output text)
   aws ec2 authorize-security-group-ingress --group-id $SG --ip-permissions \
     '[{"IpProtocol":"udp","FromPort":7882,"ToPort":7882,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]},
       {"IpProtocol":"tcp","FromPort":7881,"ToPort":7881,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]'
   # with SIP, also: IpProtocol udp, ports 10000-10100
   ```
2. Find the ingress address and create a DNS record for your LiveKit name pointing at it (CNAME for a hostname, A for an IP). If the name already exists, update it instead of creating a new one:
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

Paste the values without leading or trailing spaces.

## 6. Verify

**[validated: audio and screen share with two users over direct UDP, participants landing on both LiveKit pods, and TCP fallback. Upgrades are untested.]**

1. Start a call and join from a client outside the cluster's network. **[validated]**
2. Start several calls, each in a fresh room, and confirm participants land on more than one LiveKit pod. Use `starting RTC session` and `room_started`: the `selected node for room` line is logged by the pod that handled the request, not necessarily the one hosting the room. Rooms are placed per call, so two or three calls may all land on one pod; start more if so.
   ```bash
   for p in $(kubectl -n livekit get pods -l app.kubernetes.io/name=livekit-server -o name); do
     echo "== $p"; kubectl -n livekit logs $p --since=15m | grep -E "starting RTC session|room_started" | cut -c1-120
   done
   ```
3. Share a screen and confirm the other participant sees it. **[validated]**
4. UDP blocked (remove the 7882/udp rule), start a fresh call and confirm the selected candidate is `tcp4 ... :7881`. To print the selected candidates of recent calls (the timestamp tells calls apart): `kubectl -n livekit logs <pod> --since=5m | grep 'participant active' | grep -oE '^[0-9T:.Z-]+|\[(local|remote)\]\[selected:1\][^"]*'`. **[validated]**

## External TURN for restrictive firewalls (optional)

**[untested on Kubernetes; the coturn setup itself is validated in the Compose deployment]**

Most clients connect straight to the LiveKit nodes over UDP (7882) or TCP (7881). Clients behind a firewall that blocks both can still connect through a TURN server on TCP 443 with TLS, which looks like ordinary HTTPS. Skip this unless you have users on such networks.

The relay is [coturn](https://github.com/coturn/coturn) on a **separate host with its own public IP**, outside the cluster. LiveKit hands its address and short-lived credentials to each client when it joins, so no Calls plugin setting is needed.

```
client --TLS 443--> coturn --UDP--> LiveKit nodes (7882/udp)
```

Why not LiveKit's built-in TURN: the chart's TURN load balancer spreads connections over all pods, but LiveKit's embedded relay appears to reach only its own node, so some clients would land on a pod that does not hold their session. The TLS certificate is also read only at startup, so each renewal would restart a pod and drop its calls. coturn has neither problem and reloads certificates in place.

1. **Run coturn.** Follow the Compose deployment's `turn/README.md` (`deploy/compose/turn/`). It uses its own host, DNS name and certificate, and generates the shared secret. When it asks for the LiveKit public IP, give the public IP of **one** LiveKit node, then allow the rest. List all of them with `kubectl get nodes -l role=calls -o wide` (`EXTERNAL-IP`). `turn/setup.sh` takes a single IP, but coturn accepts several, so on the TURN host add one line per additional node and restart coturn:
   ```bash
   echo 'allowed-peer-ip=<another-livekit-node-ip>' | sudo tee -a /opt/coturn/turnserver.conf
   cd /opt/coturn && sudo docker compose restart coturn
   ```
   Do this again whenever a LiveKit node is replaced; coturn refuses to relay to any address not listed.
2. **Allow the TURN host to reach LiveKit.** 7882/udp on the LiveKit nodes must accept traffic from the TURN host. It already does if you opened it to `0.0.0.0/0` in step 4.
3. **Point LiveKit at it.** Copy `/opt/coturn/secret` from the TURN host to the machine where you run `setup.sh` (keep it mode 600), then re-run `setup.sh` with the same options as before plus the TURN options, and upgrade:
   ```bash
   ./setup.sh lk.example.com https://mattermost.example.com --acme-email you@example.com \
       --turn-host turn.example.com --turn-secret-file ./turn-secret
   helm upgrade livekit livekit/livekit-server --version 1.9.0 -n livekit -f values.yaml -f values-site.yaml
   kubectl -n livekit logs deploy/livekit-server --tail 20
   ```
   Options are not remembered, so include `--sip`, `--redis` and so on again. The upgrade restarts the pods one at a time and drops calls on the pod being restarted. `setup.sh` refuses to write any file if the secret is missing, empty or shorter than 32 characters, because LiveKit does not start with a credential-less TURN entry.
4. **Verify.** This temporarily cuts off direct media for **everyone**, so use a test cluster or a quiet window. (Alternatively, test from a client network that blocks UDP and plain TCP and leave the rules alone.) Limit 7882/udp to the TURN host and remove 7881/tcp, so TURN is the only way in. `$SG` and the rules are those of step 4; adjust the `revoke` if you used a narrower source range; `<turn-ip>` is the TURN host's public IP:
   ```bash
   aws ec2 revoke-security-group-ingress --group-id $SG --ip-permissions \
     '[{"IpProtocol":"udp","FromPort":7882,"ToPort":7882,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]},
       {"IpProtocol":"tcp","FromPort":7881,"ToPort":7881,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]'
   aws ec2 authorize-security-group-ingress --group-id $SG --ip-permissions \
     '[{"IpProtocol":"udp","FromPort":7882,"ToPort":7882,"IpRanges":[{"CidrIp":"<turn-ip>/32"}]}]'
   ```
   Start a fresh call, join with audio, and confirm the selected candidate is a relay. It should show `relay`:
   ```bash
   kubectl -n livekit logs <pod> --since=5m | grep 'participant active' | grep -oE '\[(local|remote)\]\[selected:1\][^"]*'
   ```
   Then restore the rules:
   ```bash
   aws ec2 revoke-security-group-ingress --group-id $SG --ip-permissions \
     '[{"IpProtocol":"udp","FromPort":7882,"ToPort":7882,"IpRanges":[{"CidrIp":"<turn-ip>/32"}]}]'
   aws ec2 authorize-security-group-ingress --group-id $SG --ip-permissions \
     '[{"IpProtocol":"udp","FromPort":7882,"ToPort":7882,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]},
       {"IpProtocol":"tcp","FromPort":7881,"ToPort":7881,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]'
   ```

Note: the chart writes the whole `livekit` block, including the TURN secret, to a ConfigMap, so anyone who can read ConfigMaps in the `livekit` namespace can read it. The shared secret only lets someone mint TURN credentials that coturn will relay to the allowed LiveKit addresses.

## SIP outbound (optional)

**[validated: managed trunk and an outbound call to a phone with audio in both directions, using the in-cluster bridge]**

1. Generate with `--sip` (step 2) and apply `secrets.yaml` again. Use the same `--redis` value as for LiveKit.
2. Confirm Redis and LiveKit are running, then `kubectl apply -f sip-site.yaml -f sip.yaml`. The bridge runs on the host network of a `role=calls` node, next to a LiveKit pod. If it stays `Pending`, the node has too little memory or CPU left; see Troubleshooting.
3. Open `10000-10100/udp` on that node.
4. In the plugin settings (SIP Outbound), enable outbound dialing, trunk mode **managed**, and enter your provider's trunk address, caller ID and credentials. Check `GET /plugins/com.mattermost.calls/sip/trunk-status`. A `ready` status does not prove the bridge is healthy (it can show `ready` before the bridge pod exists): check `kubectl -n livekit logs deploy/livekit-sip` and, on a test call, look for `Outbound SIP call established`. The `failed to get server reflexive address udp6 ... network is unreachable` warnings and `error closing media port: opus: invalid argument` at hangup are harmless. If it reports `sip not connected (redis required)`, fix the cause and toggle **Enable outbound phone dialing** off and on; plain re-saves do not retry.

## Operations

- Logs: `kubectl -n livekit logs -f deploy/livekit-server`
- Upgrade: change `image.tag` (and the chart `--version`), then `helm upgrade livekit livekit/livekit-server --version <v> -n livekit -f values.yaml -f values-site.yaml`. Pods restart one at a time, and calls on the restarting pod are dropped. **[validated for a values change; a version bump is untested]**
- Remove: `helm uninstall livekit -n livekit`, then `kubectl delete namespace livekit`. To remove the whole example cluster: first `helm uninstall ingress-nginx -n ingress-nginx` (it created the load balancer, which Kubernetes owns and which can block VPC deletion or keep billing if left behind), then `helm uninstall cert-manager -n cert-manager`, then `eksctl delete cluster -f eks/cluster.yaml`, and finally delete the DNS record.

## Troubleshooting

- **Certificate not issued:** `kubectl describe certificate -n livekit` and check DNS and port 80 reachability.
- **Calls start but no audio:** confirm 7882/udp and 7881/tcp are open on the nodes' security group, and that the nodes have public IPs.
- **LiveKit pods Pending:** each pod needs its own node with the `calls` label and taint.
- **LiveKit crash-loops:** it does not start if Redis is unreachable; check `livekit.redis.address`.
- **Pods stay `Pending` on small nodes:** a pod that does not fit shows `Insufficient memory` or `Too many pods` in `kubectl describe pod`. Small instances (such as `t3.small`) allow only about 11 pods per node and about 1.4 GB of allocatable memory, which a 1 GiB LiveKit request plus the SIP bridge exceeds. Use larger nodes, or lower the memory requests for a test.
- **Certificate stays `False`:** `kubectl -n livekit get challenge`. A `503` from the solver usually means the solver pod is `Pending` (see above); the ingress node group needs spare pod capacity.
- **EKS cluster creation fails with `maximum number of addresses has been reached`:** the default VPC setup creates a NAT gateway, which needs an Elastic IP. Free an address or set `vpc.nat.gateway: Disable` (nodes here are in public subnets anyway).
- **No call events in Mattermost:** LiveKit must reach `<site-url>/plugins/com.mattermost.calls/livekit-webhook`.

_Validated by the author, and by a separate agent session that followed this README and the files in this directory end to end on a fresh EKS cluster, with a human at the call-test checkpoints. Bring-your-own certificate (`--tls-secret`), external Redis (`--redis`), external TURN, production-size nodes, chart or image version upgrades, recording and transcription are untested._
