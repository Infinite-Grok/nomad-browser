"""
Automated 1v1 checkers test using two browser tabs.
Tests: invite -> accept -> moves -> verify board sync.
"""
import time, json, requests
from playwright.sync_api import sync_playwright

P1_URL = "http://localhost:5000"
P2_URL = "http://localhost:5001"
ADDR1 = "489490cc45bcfed44e0a1d0784972693"
ADDR2 = "10c4df7a995336bebdce39fa9d9e4ffc"


def main():
    # Reset both servers
    print("=== Resetting ===")
    requests.get(f"{P1_URL}/api/reset")
    requests.get(f"{P2_URL}/api/reset")
    # Add contacts
    requests.post(f"{P1_URL}/api/contacts/add", json={"address": ADDR2, "name": "Test Player"})
    requests.post(f"{P2_URL}/api/contacts/add", json={"address": ADDR1, "name": "Main Player"})
    time.sleep(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx1 = browser.new_context()
        ctx2 = browser.new_context()
        page1 = ctx1.new_page()
        page2 = ctx2.new_page()

        p1_logs, p2_logs = [], []
        page1.on("console", lambda msg: p1_logs.append(msg.text))
        page2.on("console", lambda msg: p2_logs.append(msg.text))
        page1.on("dialog", lambda d: d.accept())
        page2.on("dialog", lambda d: d.accept())

        print("=== Loading pages ===")
        page1.goto(P1_URL)
        page2.goto(P2_URL)
        page1.evaluate("localStorage.clear()")
        page2.evaluate("localStorage.clear()")
        page1.reload()
        page2.reload()
        time.sleep(3)

        # P1: Start game via JS directly (skip UI, test the engine)
        print("=== P1: Starting game ===")
        page1.evaluate(f"CheckersGame.newGame('{ADDR2}', 'Test Player')")
        time.sleep(2)

        p1_state = page1.evaluate("""() => ({
            games: Object.keys(CheckersGame.games),
            ourColor: CheckersGame.ourColor,
            active: CheckersGame.activeAddress
        })""")
        print(f"  P1: {p1_state}")

        # Wait for P2 to receive invite via polling
        print("=== Waiting for P2 invite (6s) ===")
        time.sleep(6)

        p2_state = page2.evaluate("""() => ({
            games: Object.keys(CheckersGame.games),
            ourColor: CheckersGame.ourColor,
            pendingInvites: CheckersGame._pendingInvites ? Object.keys(CheckersGame._pendingInvites) : []
        })""")
        print(f"  P2: {p2_state}")

        # P2: Accept invite
        has_banner = page2.query_selector('#invite-accept')
        if has_banner:
            print("=== P2: Accepting via banner ===")
            has_banner.click()
            time.sleep(2)
        else:
            print("  !! No invite banner. Accepting via JS...")
            page2.evaluate(f"""() => {{
                if (CheckersGame._pendingInvites && CheckersGame._pendingInvites['{ADDR1}']) {{
                    CheckersGame._acceptInvite('{ADDR1}');
                }}
            }}""")
            time.sleep(2)

        # Verify both have game state
        for label, page in [("P1", page1), ("P2", page2)]:
            state = page.evaluate("""() => {
                const keys = Object.keys(CheckersGame.games);
                if (!keys.length) return {error: 'no games'};
                const g = CheckersGame.games[keys[0]];
                return {addr: keys[0], board: g.engine.board, turn: g.engine.turn,
                        color: CheckersGame.ourColor, inDOM: document.contains(g.boardEl)};
            }""")
            print(f"  {label}: {state}")

        # P1 makes a move (black, goes first)
        print("\n=== P1 moves: click sq 8 then sq 12 ===")
        page1.evaluate("""() => {
            const g = CheckersGame.games[Object.keys(CheckersGame.games)[0]];
            g.ui.handleClick(8);
        }""")
        time.sleep(0.3)
        p1_valid = page1.evaluate("""() => {
            const g = CheckersGame.games[Object.keys(CheckersGame.games)[0]];
            return {selected: g.ui.selectedSq, validMoves: g.ui.validMoves.map(m => m.to)};
        }""")
        print(f"  After select: {p1_valid}")

        page1.evaluate("""() => {
            const g = CheckersGame.games[Object.keys(CheckersGame.games)[0]];
            g.ui.handleClick(12);
        }""")
        time.sleep(1)
        p1_after = page1.evaluate("""() => {
            const g = CheckersGame.games[Object.keys(CheckersGame.games)[0]];
            return {board: g.engine.board, turn: g.engine.turn};
        }""")
        print(f"  P1 after move: {p1_after}")

        # Wait for P2 to receive the move
        print("  Waiting for P2 to get move (6s)...")
        time.sleep(6)

        p2_after = page2.evaluate("""() => {
            const g = CheckersGame.games[Object.keys(CheckersGame.games)[0]];
            return {board: g.engine.board, turn: g.engine.turn};
        }""")
        print(f"  P2 after receive: {p2_after}")

        if p1_after['board'] == p2_after['board']:
            print("\n  *** SUCCESS: Boards match! ***")
        else:
            print("\n  !!! FAIL: Boards don't match !!!")

        # Print relevant logs
        print("\n=== P1 Logs ===")
        for log in p1_logs:
            if 'Checkers' in log or 'Chat' in log or 'Game' in log or 'Error' in log.lower():
                print(f"  {log}")
        print("=== P2 Logs ===")
        for log in p2_logs:
            if 'Checkers' in log or 'Chat' in log or 'Game' in log or 'Error' in log.lower():
                print(f"  {log}")

        browser.close()


if __name__ == "__main__":
    main()
