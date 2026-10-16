package fr.veriteinterdite.mel

import org.junit.Assert.assertEquals
import org.junit.Test

class MiniVideoSocketDeadlineTest {
    @Test fun socketTimeoutNeverExceedsRemainingVideoBudget() {
        var nanos = 0L
        val budget = MiniVideoTransferBudget(10) { nanos }
        assertEquals(45_000, budget.remainingSocketTimeoutMs())
        nanos = MiniVideoTransferBudget.MAX_DURATION_NANOS - 1_500_000L
        assertEquals(2, budget.remainingSocketTimeoutMs())
        nanos = MiniVideoTransferBudget.MAX_DURATION_NANOS - 1L
        assertEquals(1, budget.remainingSocketTimeoutMs())
        nanos = MiniVideoTransferBudget.MAX_DURATION_NANOS
        assertEquals(0, budget.remainingSocketTimeoutMs())
    }
}
