package fr.veriteinterdite.mel

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MiniVideoTransferBudgetTest {
    @Test fun invalidOrOversizedFramesAreRejectedWithoutAdvancingBudget() {
        val budget = MiniVideoTransferBudget(30)
        assertFalse(budget.reserve(0))
        assertFalse(budget.reserve(-1))
        assertFalse(budget.reserve(Int.MAX_VALUE))
        assertFalse(budget.reserve(MiniVideoTransferBudget.MAX_FRAME_BYTES + 1))
        assertTrue(budget.reserve(MiniVideoTransferBudget.MAX_FRAME_BYTES))
    }

    @Test fun cannotReceiveUnlimitedFramesEvenWhenEachFrameIsTiny() {
        val budget = MiniVideoTransferBudget(30)
        repeat(30 * MiniVideoTransferBudget.MAX_DURATION_SECONDS) {
            assertTrue(budget.reserve(1))
        }
        assertFalse(budget.reserve(1))
    }

    @Test fun lowFpsStillLimitsVideoToThreeMinutes() {
        val budget = MiniVideoTransferBudget(1)
        repeat(MiniVideoTransferBudget.MAX_DURATION_SECONDS) {
            assertTrue(budget.reserve(1))
        }
        assertFalse(budget.reserve(1))
    }

    @Test fun invalidVideoFpsIsRejected() {
        for (fps in listOf(0, -1, 31)) {
            var rejected = false
            try { MiniVideoTransferBudget(fps) } catch (_: IllegalArgumentException) {
                rejected = true
            }
            assertTrue(rejected)
        }
    }

    @Test fun cumulativeBytesAreCappedEvenWhenFrameCountIsBelowLimit() {
        val budget = MiniVideoTransferBudget(30)
        val frame = MiniVideoTransferBudget.MAX_FRAME_BYTES
        repeat((MiniVideoTransferBudget.MAX_TOTAL_BYTES / frame).toInt()) {
            assertTrue(budget.reserve(frame))
        }
        assertFalse(budget.reserve(1))
        assertFalse(budget.reserve(frame))
    }

    @Test fun slowSenderCannotExtendRecordingBeyondMonotonicDeadline() {
        var now = 1_000_000_000L
        val budget = MiniVideoTransferBudget(30) { now }
        assertTrue(budget.reserve(1))
        now += MiniVideoTransferBudget.MAX_DURATION_NANOS - 1
        assertTrue(budget.reserve(1))
        now += 1
        assertFalse(budget.reserve(1))
        // Once expired, a sender cannot resume later with another frame.
        now += 30_000_000_000L
        assertFalse(budget.reserve(1))
    }

    @Test fun deadlineIsIndependentOfFpsOrPayloadSize() {
        for (fps in listOf(1, 10, 30)) {
            var now = 0L
            val budget = MiniVideoTransferBudget(fps) { now }
            assertTrue(budget.reserve(MiniVideoTransferBudget.MAX_FRAME_BYTES))
            now = MiniVideoTransferBudget.MAX_DURATION_NANOS
            assertFalse(budget.reserve(1))
        }
    }
}
