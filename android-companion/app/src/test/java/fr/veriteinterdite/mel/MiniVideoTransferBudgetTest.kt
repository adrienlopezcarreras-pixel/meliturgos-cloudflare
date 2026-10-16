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
}
