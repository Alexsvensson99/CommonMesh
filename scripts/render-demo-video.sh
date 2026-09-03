#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${COMMONMESH_VIDEO_WORK_DIR:-/private/tmp/commonmesh-video-build}"
OUTPUT_FILE="${1:-/private/tmp/commonmesh-demo-final.mp4}"
NARRATION_FILE="${COMMONMESH_NARRATION_FILE:-/private/tmp/commonmesh-narration-97.aiff}"
LIVE_STAGE_FILE="${COMMONMESH_LIVE_STAGE_FILE:-/private/tmp/commonmesh-live-webmcp-stage-v2.mov}"
LIVE_BOUNDARY_FILE="${COMMONMESH_LIVE_BOUNDARY_FILE:-/private/tmp/commonmesh-live-approval-boundary-v2.mov}"
CONTACT_SHEET="${COMMONMESH_VIDEO_CONTACT_SHEET:-/private/tmp/commonmesh-demo-contact-sheet.jpg}"
QA_DIR="${COMMONMESH_VIDEO_QA_DIR:-/private/tmp/commonmesh-demo-qa-frames}"
QA_REPORT="${COMMONMESH_VIDEO_QA_REPORT:-/private/tmp/commonmesh-demo-qa-report.txt}"

VIDEO_DURATION=170
FRAME_RATE=30
NARRATION_TEMPO=0.9
NARRATION_DELAY_MS=250
LOUDNESS_TARGET=-13.94
TRUE_PEAK_TARGET=-1.7

mkdir -p "$WORK_DIR/slides" "$WORK_DIR/segments" "$QA_DIR"
find "$QA_DIR" -maxdepth 1 -type f -name '*.jpg' -delete

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

compose_slide() {
  local source_file="$1"
  local output_file="$2"

  ffmpeg -hide_banner -loglevel error -y \
    -i "$source_file" \
    -filter_complex \
      "[0:v]split=2[background][foreground];\
       [background]scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,\
       crop=1920:1080,gblur=sigma=26,eq=brightness=-0.28:saturation=0.58,\
       drawbox=x=0:y=0:w=iw:h=ih:color=0x06231A@0.42:t=fill[backdrop];\
       [foreground]scale=1880:1000:force_original_aspect_ratio=decrease:flags=lanczos,\
       pad=iw+12:ih+12:6:6:color=0xE8F1EC[card];\
       [backdrop][card]overlay=(W-w)/2:(H-h)/2,format=rgb24[slide]" \
    -map "[slide]" -frames:v 1 "$output_file"
}

compose_focus_slide() {
  local source_file="$1"
  local crop_filter="$2"
  local output_file="$3"
  local crop_file="$WORK_DIR/slides/focus-source-$(basename "$output_file")"

  ffmpeg -hide_banner -loglevel error -y \
    -i "$source_file" -vf "$crop_filter" -frames:v 1 "$crop_file"
  compose_slide "$crop_file" "$output_file"
}

render_segment() {
  local source_file="$1"
  local frame_count="$2"
  local output_file="$3"

  ffmpeg -hide_banner -loglevel error -y \
    -loop 1 -framerate "$FRAME_RATE" -i "$source_file" \
    -vf "zoompan=z='min(zoom+0.00002,1.012)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FRAME_RATE},format=yuv420p" \
    -frames:v "$frame_count" \
    -an -c:v libx264 -preset medium -crf 18 -profile:v high -level:v 4.1 \
    -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited" \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
    -movflags +faststart "$output_file"
}

render_live_stage_segment() {
  local source_file="$1"
  local output_file="$2"

  # The raw recording is a real split-screen WebMCP run. Build a clean proof
  # view from two untouched regions: the agent's English invocation (switching
  # to the real WebMCP tool rows once they appear) and the CommonMesh browser.
  # Unrelated Codex progress text and the composer are outside these crops.
  ffmpeg -hide_banner -loglevel error -y \
    -ss 14.5 -t 13.3 -i "$source_file" \
    -filter_complex \
      "[0:v]setpts=PTS-STARTPTS,split=5[bg0][prompt0][toolname0][toolresult0][app0];\
       [bg0]crop=1230:1068:670:120,\
       scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,\
       crop=1920:1080,gblur=sigma=32,eq=brightness=-0.34:saturation=0.55,\
       drawbox=x=0:y=0:w=iw:h=ih:color=0x06231A@0.48:t=fill[bg];\
       [prompt0]trim=start_frame=30:end_frame=31,setpts=PTS-STARTPTS,\
       crop=670:280:0:695,scale=660:276:flags=lanczos,\
       pad=672:288:6:6:color=0xDCE9E1,\
       pad=700:500:14:106:color=0x06231A,\
       tpad=stop_mode=clone:stop_duration=13.3[prompt];\
       [toolname0]trim=start_frame=720:end_frame=721,setpts=PTS-STARTPTS,\
       crop=640:50:15:880,scale=660:52:flags=lanczos[toolname];\
       [toolresult0]trim=start_frame=720:end_frame=721,setpts=PTS-STARTPTS,\
       crop=640:50:15:985,scale=660:52:flags=lanczos[toolresult];\
       [toolname][toolresult]vstack=inputs=2,\
       pad=672:116:6:6:color=0xDCE9E1,\
       pad=700:500:14:192:color=0x06231A,\
       tpad=stop_mode=clone:stop_duration=13.3[tools];\
       [prompt][tools]overlay=0:0:enable='gte(t,12.0)'[agent];\
       [app0]crop=1230:1068:670:120,scale=1120:973:flags=lanczos,\
       pad=1132:985:6:6:color=0xDCE9E1,\
       pad=1160:1020:14:17:color=0x06231A[app];\
       [bg][agent]overlay=30:290[base];\
       [base][app]overlay=730:30,setpts=1.305764*PTS,fps=${FRAME_RATE},\
       setsar=1,format=yuv420p[out]" \
    -map "[out]" -frames:v 521 \
    -an -c:v libx264 -preset medium -crf 18 -profile:v high -level:v 4.1 \
    -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited" \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
    -movflags +faststart "$output_file"
}

render_live_boundary_segment() {
  local source_file="$1"
  local output_file="$2"

  # The browser activity trail is the authoritative shared result. Isolate it
  # from the raw split-screen capture so only CommonMesh's genuine staged and
  # APPROVAL_REQUIRED records remain visible.
  ffmpeg -hide_banner -loglevel error -y \
    -ss 5.5 -t 12.2 -i "$source_file" \
    -filter_complex \
      "[0:v]setpts=PTS-STARTPTS,split=2[bg0][app0];\
       [bg0]crop=1230:1068:670:120,\
       scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,\
       crop=1920:1080,gblur=sigma=32,eq=brightness=-0.34:saturation=0.55,\
       drawbox=x=0:y=0:w=iw:h=ih:color=0x06231A@0.48:t=fill[bg];\
       [app0]crop=1230:820:670:0,scale=1580:1053:flags=lanczos,\
       pad=1592:1065:6:6:color=0xDCE9E1[app];\
       [bg][app]overlay=164:7,fps=${FRAME_RATE},setsar=1,\
       format=yuv420p[out]" \
    -map "[out]" -frames:v 366 \
    -an -c:v libx264 -preset medium -crf 18 -profile:v high -level:v 4.1 \
    -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited" \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
    -movflags +faststart "$output_file"
}

require_command ffmpeg
require_command ffprobe
require_command jq
require_command shasum

require_file "$NARRATION_FILE"
require_file "$LIVE_STAGE_FILE"
require_file "$LIVE_BOUNDARY_FILE"
require_file "$REPO_DIR/docs/video/commonmesh-thumbnail.png"

for screenshot in \
  01-overview.png \
  02-agent-proposed-plan.png \
  03-human-approved-plan.png \
  04-repair-plan.png \
  05-committed-plan.jpg \
  07-webmcp-tools-live.jpg \
  08-webmcp-repair-live.jpg \
  09-approval-required-live.jpg; do
  require_file "$REPO_DIR/docs/screenshots/$screenshot"
done

# Rebuild the title from clean source regions. The original thumbnail embeds a
# browser capture with transient Detecting/Checking labels, so retain only its
# authored brand panel and pair it with truthful reset-state product crops.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=0x06231A:s=1920x1080" \
  -i "$REPO_DIR/docs/video/commonmesh-thumbnail.png" \
  -i "$REPO_DIR/docs/screenshots/01-overview.png" \
  -filter_complex \
    "[1:v]crop=600:720:0:0,scale=780:936:flags=lanczos[brand];\
     [2:v]split=2[hero0][needs0];\
     [hero0]crop=1180:480:260:70,scale=1000:407:flags=lanczos,\
     pad=1012:419:6:6:color=0xDCE9E1[hero];\
     [needs0]crop=747:555:0:545,scale=700:520:flags=lanczos,\
     pad=712:532:6:6:color=0xDCE9E1[needs];\
     [0:v][brand]overlay=30:72[base];\
     [base][hero]overlay=870:110[mid];\
     [mid][needs]overlay=1095:520,format=rgb24[title]" \
  -map "[title]" -frames:v 1 "$WORK_DIR/slides/00-title.png"

compose_focus_slide "$REPO_DIR/docs/screenshots/01-overview.png" \
  "crop=1180:480:260:70" "$WORK_DIR/slides/01-overview-hero.png"
compose_focus_slide "$REPO_DIR/docs/screenshots/01-overview.png" \
  "crop=747:555:0:545" "$WORK_DIR/slides/02-overview-needs.png"
compose_slide "$REPO_DIR/docs/screenshots/07-webmcp-tools-live.jpg" "$WORK_DIR/slides/03-tools.png"
compose_focus_slide "$REPO_DIR/docs/screenshots/02-agent-proposed-plan.png" \
  "crop=1116:480:292:70" "$WORK_DIR/slides/04-proposed-hero.png"
compose_focus_slide "$REPO_DIR/docs/screenshots/02-agent-proposed-plan.png" \
  "crop=640:440:760:635" "$WORK_DIR/slides/05-proposed-plan.png"
compose_focus_slide "$REPO_DIR/docs/screenshots/03-human-approved-plan.png" \
  "crop=640:440:760:635" "$WORK_DIR/slides/06-approved.png"
compose_slide "$REPO_DIR/docs/screenshots/05-committed-plan.jpg" "$WORK_DIR/slides/07-committed.png"
compose_focus_slide "$REPO_DIR/docs/screenshots/05-committed-plan.jpg" \
  "crop=640:95:760:640" "$WORK_DIR/slides/07-committed-lifecycle.png"
compose_focus_slide "$REPO_DIR/docs/screenshots/04-repair-plan.png" \
  "crop=1116:218:292:402" "$WORK_DIR/slides/08-disruption.png"
compose_slide "$REPO_DIR/docs/screenshots/08-webmcp-repair-live.jpg" "$WORK_DIR/slides/09-repair.png"

slides=(
  00-title.png
  01-overview-hero.png
  02-overview-needs.png
  03-tools.png
  LIVE_STAGE
  04-proposed-hero.png
  05-proposed-plan.png
  LIVE_BOUNDARY
  06-approved.png
  07-committed-lifecycle.png
  08-disruption.png
  09-repair.png
  07-committed.png
)

# Every value is an integer frame count at 30 fps. Boundaries are rounded to
# the measured narration paragraph ends: 35.25, 52.30, 69.65, 89.67, 101.87,
# 119.57, 132.24, and 148.29 seconds. The sum is exactly 5,100 frames / 170 s.
frame_counts=(150 520 387 512 521 300 300 366 259 272 380 482 651)

concat_file="$WORK_DIR/segments.txt"
: > "$concat_file"

for index in "${!slides[@]}"; do
  printf -v segment_name '%02d.mp4' "$index"
  case "${slides[$index]}" in
    LIVE_STAGE)
      # 13.3 seconds of authentic tool use, slowed 1.305764x to the 521-frame
      # narration block and reframed to exclude unrelated Codex worklog text.
      render_live_stage_segment \
        "$LIVE_STAGE_FILE" "$WORK_DIR/segments/$segment_name"
      ;;
    LIVE_BOUNDARY)
      # Normal-speed browser proof of commit_approved_plan returning
      # APPROVAL_REQUIRED in CommonMesh's authoritative Activity Trail.
      render_live_boundary_segment \
        "$LIVE_BOUNDARY_FILE" "$WORK_DIR/segments/$segment_name"
      ;;
    *)
      render_segment \
        "$WORK_DIR/slides/${slides[$index]}" \
        "${frame_counts[$index]}" \
        "$WORK_DIR/segments/$segment_name"
      ;;
  esac
  printf "file '%s'\n" "$WORK_DIR/segments/$segment_name" >> "$concat_file"
done

ffmpeg -hide_banner -loglevel error -y \
  -f concat -safe 0 -i "$concat_file" -c copy "$WORK_DIR/picture.mp4"

# Analyze the time-stretched voice first, then apply the measured values in a
# deterministic second loudnorm pass. The target is raised by 0.06 LUFS so the
# short head/tail silence lands the complete 170-second program near -14 LUFS.
ffmpeg -hide_banner -y \
  -i "$NARRATION_FILE" \
  -af "atempo=${NARRATION_TEMPO},aresample=48000,pan=stereo|c0=c0|c1=c0,loudnorm=I=${LOUDNESS_TARGET}:LRA=7:TP=${TRUE_PEAK_TARGET}:print_format=json" \
  -f null - 2> "$WORK_DIR/loudnorm-pass-1.log"

awk '/^\{/ { capture=1 } capture { print } /^\}/ { exit }' \
  "$WORK_DIR/loudnorm-pass-1.log" > "$WORK_DIR/loudnorm-pass-1.json"

measured_i="$(jq -r '.input_i' "$WORK_DIR/loudnorm-pass-1.json")"
measured_lra="$(jq -r '.input_lra' "$WORK_DIR/loudnorm-pass-1.json")"
measured_tp="$(jq -r '.input_tp' "$WORK_DIR/loudnorm-pass-1.json")"
measured_thresh="$(jq -r '.input_thresh' "$WORK_DIR/loudnorm-pass-1.json")"
target_offset="$(jq -r '.target_offset' "$WORK_DIR/loudnorm-pass-1.json")"

ffmpeg -hide_banner -loglevel error -y \
  -i "$NARRATION_FILE" \
  -f lavfi -t "$VIDEO_DURATION" -i "anullsrc=r=48000:cl=stereo" \
  -filter_complex \
    "[0:a]atempo=${NARRATION_TEMPO},aresample=48000,pan=stereo|c0=c0|c1=c0,loudnorm=I=${LOUDNESS_TARGET}:LRA=7:TP=${TRUE_PEAK_TARGET}:measured_I=${measured_i}:measured_LRA=${measured_lra}:measured_TP=${measured_tp}:measured_thresh=${measured_thresh}:offset=${target_offset}:linear=true:print_format=summary,aresample=48000,adelay=${NARRATION_DELAY_MS}:all=1[voice];\
     [1:a][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[audio]" \
  -map "[audio]" \
  -c:a pcm_s24le "$WORK_DIR/narration-normalized.wav"

ffmpeg -hide_banner -loglevel error -y \
  -i "$WORK_DIR/picture.mp4" -i "$WORK_DIR/narration-normalized.wav" \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -t "$VIDEO_DURATION" \
  -movflags +faststart \
  -metadata title="CommonMesh: Human-Approved Coordination with WebMCP" \
  -metadata comment="Built for the 2026 WebMCP Challenge" \
  "$OUTPUT_FILE"

# Decode every packet, then extract representative frames at every key state.
ffmpeg -hide_banner -loglevel error -i "$OUTPUT_FILE" -f null -

qa_timestamps=(2 20 28 40 55 69 78 94 100 107 115 125 140 155)
qa_frames=()

for index in "${!qa_timestamps[@]}"; do
  printf -v frame_name '%02d-%03ds.jpg' "$index" "${qa_timestamps[$index]}"
  frame_path="$QA_DIR/$frame_name"
  ffmpeg -hide_banner -loglevel error -y \
    -ss "${qa_timestamps[$index]}" -i "$OUTPUT_FILE" \
    -frames:v 1 -q:v 2 "$frame_path"
  qa_frames+=("$frame_path")
done

ffmpeg -hide_banner -loglevel error -y \
  -i "${qa_frames[0]}" -i "${qa_frames[1]}" \
  -i "${qa_frames[2]}" -i "${qa_frames[3]}" \
  -i "${qa_frames[4]}" -i "${qa_frames[5]}" \
  -i "${qa_frames[6]}" -i "${qa_frames[7]}" \
  -i "${qa_frames[8]}" -i "${qa_frames[9]}" \
  -i "${qa_frames[10]}" -i "${qa_frames[11]}" \
  -i "${qa_frames[12]}" -i "${qa_frames[13]}" \
  -filter_complex \
    "[0:v]scale=480:270[v0];[1:v]scale=480:270[v1];\
     [2:v]scale=480:270[v2];[3:v]scale=480:270[v3];\
     [4:v]scale=480:270[v4];[5:v]scale=480:270[v5];\
     [6:v]scale=480:270[v6];[7:v]scale=480:270[v7];\
     [8:v]scale=480:270[v8];[9:v]scale=480:270[v9];\
     [10:v]scale=480:270[v10];[11:v]scale=480:270[v11];\
     [12:v]scale=480:270[v12];[13:v]scale=480:270[v13];\
     [v0][v1][v2][v3][v4][v5][v6][v7][v8][v9][v10][v11][v12][v13]\
     xstack=inputs=14:layout=0_0|480_0|960_0|1440_0|0_270|480_270|960_270|1440_270|0_540|480_540|960_540|1440_540|0_810|480_810:fill=0x071a14[v]" \
  -map "[v]" -frames:v 1 -q:v 2 "$CONTACT_SHEET"

ffmpeg -hide_banner -y -i "$OUTPUT_FILE" \
  -af "loudnorm=I=-14:LRA=7:TP=-1.5:print_format=json" \
  -f null - 2> "$WORK_DIR/loudness-final.log"
awk '/^\{/ { capture=1 } capture { print } /^\}/ { exit }' \
  "$WORK_DIR/loudness-final.log" > "$WORK_DIR/loudness-final.json"

{
  echo "CommonMesh demo video QA"
  echo "decode=pass"
  echo "sha256=$(shasum -a 256 "$OUTPUT_FILE" | awk '{print $1}')"
  echo
  ffprobe -v error -show_entries \
    format=duration,size,bit_rate:stream=index,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,sample_rate,channels,channel_layout,duration,bit_rate,color_range,color_space,color_transfer,color_primaries \
    -of json "$OUTPUT_FILE"
  echo
  echo "Final encoded-program loudness:"
  cat "$WORK_DIR/loudness-final.json"
} > "$QA_REPORT"

echo "video=$OUTPUT_FILE"
echo "contact_sheet=$CONTACT_SHEET"
echo "qa_frames=$QA_DIR"
echo "qa_report=$QA_REPORT"
