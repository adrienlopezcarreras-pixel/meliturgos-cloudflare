package fr.veriteinterdite.mel

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MiniVideoTransferBudgetTest {
    @Test fun invalidOrOversizedFramesAreRejectedWithoutAdvancingBudget() {
        val budget = MiniVideoTransferBudget()
        assertFalse(budget.reserve(0))
        assertFalse(budget.reserve(-1))
        assertFalse(budget.reserve(Int.MAX_VALUE))
        assertFalse(budget.reserve(MiniVideoTransferBudget.MAX_FRAME_BYTES + 1))
        assertTrue(budget.reserve(MiniVideoTransferBudget.MAX_FRAME_BYTES))
    }

    @Test fun cannotReceiveUnlimitedFramesEvenWhenEachFrameIsTiny() {
        val budget = MiniVideoTransferBudget()
        repeat(MiniVideoTransferBudget.MAX_FRAMES) {
            assertTrue(budget.reserve(1))
        }
        assertFalse(budget.reserve(1))
    }

    @Test fun cumulativeBytesAreCappedEvenWhenFrameCountIsBelowLimit() {
        val budget = MiniVideoTransferBudget()
        val frame = MiniVideoTransferBudget.MAX_FRAME_BYTES
        repeat((MiniVideoTransferBudget.MAX_TOTAL_BYTES / frame).toInt()) {
            assertTrue(budget.reserve(frame))
        }
        assertFalse(budget.reserve(1))
        assertFalse(budget.reserve(frame))
    }
}
