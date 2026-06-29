# SIPp UAS sink for the LiveKit SIP E2E harness.
#
# Built from Debian's sip-tester package rather than a public SIPp image: those
# only ship a floating `latest` tag (and some wrap an opaque entrypoint), which
# breaks the repo's pin-everything norm. The Debian release pins the version.
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends sip-tester \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY uas.xml /etc/sipp/uas.xml

# `-i` needs the container's own IP (it goes into the Contact + SDP that LiveKit
# dials media back to), so compute it at runtime. No `-m` limit: run as a
# long-lived server answering calls across test retries. `-bg` is omitted so
# SIPp stays the foreground process and the container lives as long as it does.
# `-trace_msg` logs every SIP message as it arrives (e.g. the inbound INVITE) to
# a file in the workdir; `-trace_err` records protocol errors. (`-screen_file`
# is deliberately not used: SIPp only writes the stats screen on quit, so it
# yields nothing for a server that never exits.)
#
# `-default_behaviors all,-abortunexp`: LiveKit sends a post-answer re-INVITE
# (media renegotiation) the smoke scenario doesn't model. Default SIPp would
# abort the call on that "unexpected" message; we keep every other default
# (auto-BYE, ping reply) but stop aborting, so the trailing re-INVITE/ACK is
# logged and ignored instead of flagged as a failure.
WORKDIR /var/log/sipp
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["exec sipp -i \"$(hostname -i)\" -p 5060 -sf /etc/sipp/uas.xml -nostdin -trace_err -trace_msg -default_behaviors all,-abortunexp"]
