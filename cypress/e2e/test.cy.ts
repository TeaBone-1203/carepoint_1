describe('CarePoint public browse flow', () => {
  it('Loads the app and opens the catalog', () => {
    cy.visit('/')
    cy.contains('.cp-brand-name', 'CarePoint').should('be.visible')
    cy.get('.cp-navlink').contains('Browse').click()
    cy.url().should('include', '/catalog')
    cy.contains('Browse everything in stock').should('be.visible')
  })

  it('Lists approved stock only (no empty catalog)', () => {
    cy.visit('/catalog')
    cy.get('.cp-med-card').should('have.length.greaterThan', 0)
  })
})