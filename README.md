# yiphang-portfolio-tests

Functional tests for yiphang-portfolio, written with Playwright and TypeScript.

The tests run against a live deployment of the site. Set the `BASE_URL` environment variable to the URL to test.

Tests are written from `SPEC.md` and issue text only, never from the site's source code. Each test checks one requirement and names the line of `SPEC.md` it comes from.
