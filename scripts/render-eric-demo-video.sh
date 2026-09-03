#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_VIDEO="${COMMONMESH_SOURCE_VIDEO:-/private/tmp/commonmesh-demo-final-331fe821.mp4}"
NARRATION_FILE="${COMMONMESH_NARRATION_FILE:-$REPO_DIR/docs/video/commonmesh-narration-eric-v2.mp3}"
OUTPUT_FILE="${1:-/private/tmp/commonmesh-demo-eric-v2-candidate.mp4}"
WORK_DIR="${COMMONMESH_AUDIO_WORK_DIR:-/private/tmp/commonmesh-eric-v2-audio-build}"
QA_REPORT="${COMMONMESH_AUDIO_QA_REPORT:-/private/tmp/commonmesh-eric-v2-qa-report.txt}"

EXPECTED_SOURCE_VIDEO_SHA256="331fe8211a7f5d318cfc5f48d1ed95731e569bafedcc183307ce72ebebf21d1b"
EXPECTED_NARRATION_SHA256="ce0c22204780a037f3a66b15f878affeb2fd35bdb65da18b80d10a10fa8e1c89"

VIDEO_DURATION=170
LOUDNESS_TARGET=-13.94
TRUE_PEAK_TARGET=-1.7

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "Missing required file: $1" >&2
    exit 1
  fi
}

sha256() {
  shasum -a 256 "$1" | awk '{print $1}'
}

require_command ffmpeg
require_command ffprobe
require_command jq
require_command shasum
require_file "$SOURCE_VIDEO"
require_file "$NARRATION_FILE"

source_video_sha256="$(sha256 "$SOURCE_VIDEO")"
narration_sha256="$(sha256 "$NARRATION_FILE")"

if [[ "$source_video_sha256" != "$EXPECTED_SOURCE_VIDEO_SHA256" ]]; then
  echo "Unexpected source-video hash: $source_video_sha256" >&2
  exit 1
fi

if [[ "$narration_sha256" != "$EXPECTED_NARRATION_SHA256" ]]; then
  echo "Unexpected narration hash: $narration_sha256" >&2
  exit 1
fi

mkdir -p "$WORK_DIR"

# The exact Eric generation contains nine authored 0.7-second SSML breaks.
# Split each break at its midpoint, then align the ten narration paragraphs to
# the already verified picture and caption boundaries. Slow-down is capped at
# ten percent; remaining slack becomes clean breathing room at paragraph ends.
ffmpeg -hide_banner -loglevel error -y \
  -i "$NARRATION_FILE" \
  -filter_complex \
    "[0:a]asplit=10[a0][a1][a2][a3][a4][a5][a6][a7][a8][a9];\
     [a0]atrim=start=0:end=14.008084,asetpts=PTS-STARTPTS,atempo=0.900000,apad=whole_dur=16.286,atrim=duration=16.286[s0];\
     [a1]atrim=start=14.008084:end=29.150397,asetpts=PTS-STARTPTS,atempo=0.900000,apad=whole_dur=18.705,atrim=duration=18.705[s1];\
     [a2]atrim=start=29.150397:end=43.593719,asetpts=PTS-STARTPTS,atempo=0.900000,apad=whole_dur=17.053,atrim=duration=17.053[s2];\
     [a3]atrim=start=43.593719:end=58.794229,asetpts=PTS-STARTPTS,atempo=0.900000,apad=whole_dur=17.344,atrim=duration=17.344[s3];\
     [a4]atrim=start=58.794229:end=76.222211,asetpts=PTS-STARTPTS,atempo=0.900000,apad=whole_dur=20.021,atrim=duration=20.021[s4];\
     [a5]atrim=start=76.222211:end=89.060488,asetpts=PTS-STARTPTS,atempo=1.052490,apad=whole_dur=12.198,atrim=duration=12.198[s5];\
     [a6]atrim=start=89.060488:end=107.063515,asetpts=PTS-STARTPTS,atempo=1.016661,apad=whole_dur=17.708,atrim=duration=17.708[s6];\
     [a7]atrim=start=107.063515:end=117.043844,asetpts=PTS-STARTPTS,atempo=0.900000,apad=whole_dur=12.668,atrim=duration=12.668[s7];\
     [a8]atrim=start=117.043844:end=131.585318,asetpts=PTS-STARTPTS,atempo=0.906350,apad=whole_dur=16.044,atrim=duration=16.044[s8];\
     [a9]atrim=start=131.585318:end=148.401625,asetpts=PTS-STARTPTS,atempo=0.900000,apad=whole_dur=19.634,atrim=duration=19.634[s9];\
     [s0][s1][s2][s3][s4][s5][s6][s7][s8][s9]concat=n=10:v=0:a=1,\
     aresample=48000,adelay=260:all=1,apad=whole_dur=${VIDEO_DURATION},\
     atrim=duration=${VIDEO_DURATION}[aligned]" \
  -map "[aligned]" -c:a pcm_s24le "$WORK_DIR/narration-aligned.wav"

# Measure first, then normalize deterministically to the existing delivery
# target. This keeps the exact 170-second program close to -14 LUFS.
ffmpeg -hide_banner -y \
  -i "$WORK_DIR/narration-aligned.wav" \
  -af "pan=stereo|c0=c0|c1=c0,loudnorm=I=${LOUDNESS_TARGET}:LRA=7:TP=${TRUE_PEAK_TARGET}:print_format=json" \
  -f null - 2> "$WORK_DIR/loudnorm-pass-1.log"

awk '/^\{/ { capture=1 } capture { print } /^\}/ { exit }' \
  "$WORK_DIR/loudnorm-pass-1.log" > "$WORK_DIR/loudnorm-pass-1.json"

measured_i="$(jq -r '.input_i' "$WORK_DIR/loudnorm-pass-1.json")"
measured_lra="$(jq -r '.input_lra' "$WORK_DIR/loudnorm-pass-1.json")"
measured_tp="$(jq -r '.input_tp' "$WORK_DIR/loudnorm-pass-1.json")"
measured_thresh="$(jq -r '.input_thresh' "$WORK_DIR/loudnorm-pass-1.json")"
target_offset="$(jq -r '.target_offset' "$WORK_DIR/loudnorm-pass-1.json")"

ffmpeg -hide_banner -loglevel error -y \
  -i "$WORK_DIR/narration-aligned.wav" \
  -af "pan=stereo|c0=c0|c1=c0,loudnorm=I=${LOUDNESS_TARGET}:LRA=7:TP=${TRUE_PEAK_TARGET}:measured_I=${measured_i}:measured_LRA=${measured_lra}:measured_TP=${measured_tp}:measured_thresh=${measured_thresh}:offset=${target_offset}:linear=true:print_format=summary,aresample=48000" \
  -c:a pcm_s24le "$WORK_DIR/narration-normalized.wav"

ffmpeg -hide_banner -loglevel error -y \
  -i "$SOURCE_VIDEO" -i "$WORK_DIR/narration-normalized.wav" \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -t "$VIDEO_DURATION" \
  -movflags +faststart \
  -metadata title="CommonMesh: Human-Approved Coordination with WebMCP" \
  -metadata comment="Built for the 2026 WebMCP Challenge" \
  "$OUTPUT_FILE"

ffmpeg -hide_banner -loglevel error -i "$OUTPUT_FILE" -f null -

ffmpeg -hide_banner -y -i "$OUTPUT_FILE" \
  -af "loudnorm=I=-14:LRA=7:TP=-1.5:print_format=json" \
  -f null - 2> "$WORK_DIR/loudness-final.log"
awk '/^\{/ { capture=1 } capture { print } /^\}/ { exit }' \
  "$WORK_DIR/loudness-final.log" > "$WORK_DIR/loudness-final.json"

{
  echo "CommonMesh Eric v2 demo-video QA"
  echo "decode=pass"
  echo "source_video_sha256=$source_video_sha256"
  echo "narration_sha256=$narration_sha256"
  echo "output_sha256=$(sha256 "$OUTPUT_FILE")"
  echo
  ffprobe -v error -show_entries \
    format=duration,size,bit_rate:stream=index,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,sample_rate,channels,channel_layout,duration,bit_rate,color_range,color_space,color_transfer,color_primaries \
    -of json "$OUTPUT_FILE"
  echo
  echo "Final encoded-program loudness:"
  cat "$WORK_DIR/loudness-final.json"
} > "$QA_REPORT"

echo "video=$OUTPUT_FILE"
echo "qa_report=$QA_REPORT"
