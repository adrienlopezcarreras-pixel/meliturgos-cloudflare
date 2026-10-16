#pragma once

#include <cmath>

// Validate untrusted JSON numbers before any conversion to signed integers.
// Prevents undefined float-to-integer casts, fractional timezones and
// implausible dates during MINI's Android Link V2 SESSION handshake.
static inline bool mel_link_v2_session_clock_bounds(
    double epoch_ms,
    double utc_offset_seconds
) {
    constexpr double kMinEpochMs = 1700000000000.0; // Late 2023.
    constexpr double kMaxEpochMs = 4102444800000.0; // 2100-01-01 UTC.
    return std::isfinite(epoch_ms) &&
           std::isfinite(utc_offset_seconds) &&
           epoch_ms >= kMinEpochMs && epoch_ms <= kMaxEpochMs &&
           std::floor(epoch_ms) == epoch_ms &&
           utc_offset_seconds >= -50400.0 &&
           utc_offset_seconds <= 50400.0 &&
           std::floor(utc_offset_seconds) == utc_offset_seconds &&
           std::fmod(utc_offset_seconds, 60.0) == 0.0;
}
