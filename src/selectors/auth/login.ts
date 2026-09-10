export const MicrosoftLoginSelectors = {
  txtEmail: 'input[type="email"][name="loginfmt"]',
  btnNext: 'input[type="submit"][value="Next"]',
  txtPassword: 'input[type="password"][name="passwd"]',
  btnSignIn: 'input[type="submit"][value="Sign in"]',
  btnYesStaySignedIn: 'input[type="submit"][value="Yes"]',
  btnNoStaySignedIn: 'input[type="button"][value="No"]',
  divError: '#usernameError, #passwordError',
  btnContinueNow: 'button:has-text("Continue Now")',
} as const;
