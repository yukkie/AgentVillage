import anthropic


def create_client() -> anthropic.Anthropic:
    return anthropic.Anthropic()
