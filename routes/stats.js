const {
  boldTextInHtml,
  createHtmlResponse,
  escapeHtml
} = require('./route-utils')

const listStats = ctx => {
  const GITHUB_ORG_NAME = ctx.state.GITHUB_ORG_NAME
  const initialDataLoaded = ctx.state.initialDataLoaded

  if (!initialDataLoaded) {
    ctx.status = 503
    ctx.set('Retry-After', 60 * 5)
    ctx.body = createHtmlResponse( ''
      + '<pre>'
        + JSON.stringify({
            action: 'load-pull-request-stats',
            success: false,
            error: boldTextInHtml('org data not yet loaded. please try again later.')
          }, null, 2)
      + '</pre>'
    )

    return
  }

  const pulls = ctx.state.pulls
  const repos = ctx.state.repos
  const users = ctx.state.users
  const orgDataSize = ctx.state.orgDataSize

  const prsThisWeek = pulls
                        .index_get('created:this-week')
                        .map(pullKey => pulls.get(pullKey).data)

  const prsThisWeekAuthors = prsThisWeek.reduce((state, pr) => {
    const normalizedUsername = pr.user_key
    if (!state[normalizedUsername]) state[normalizedUsername] = []

    state[normalizedUsername].push(pr)
    return state
  }, {})

  const activeReposThisWeek = prsThisWeek
                                .reduce((state, pr) => {
                                  if (!state[pr.repo_key]) state[pr.repo_key] = []

                                  state[pr.repo_key].push(pr)
                                  return state
                                }, {})

  const prsLastWeek = pulls
                        .index_get('created:last-week')
                        .map(pullKey => pulls.get(pullKey).data)

  const prsLastWeekAuthors = prsLastWeek.reduce((state, pr) => {
    const normalizedUsername = pr.user_key
    if (!state[normalizedUsername]) state[normalizedUsername] = []

    state[normalizedUsername].push(pr)
    return state
  }, {})

  const activeReposLastWeek = prsLastWeek
                                .reduce((state, pr) => {
                                  if (!state[pr.repo_key]) state[pr.repo_key] = []

                                  state[pr.repo_key].push(pr)
                                  return state
                                }, {})

  const prsThisMonth = pulls
                        .index_get('created:this-month')
                        .map(pullKey => pulls.get(pullKey).data)

  const prsThisMonthAuthors = prsThisMonth.reduce((state, pr) => {
    const normalizedUsername = pr.user_key
    if (!state[normalizedUsername]) state[normalizedUsername] = []

    state[normalizedUsername].push(pr)
    return state
  }, {})

  const activeReposThisMonth = prsThisMonth
                                .reduce((state, pr) => {
                                  if (!state[pr.repo_key]) state[pr.repo_key] = []

                                  state[pr.repo_key].push(pr)
                                  return state
                                }, {})

  const prsLastMonth = pulls
                        .index_get('created:last-month')
                        .map(pullKey => pulls.get(pullKey).data)

  const prsLastMonthAuthors = prsLastMonth.reduce((state, pr) => {
    const normalizedUsername = pr.user_key
    if (!state[normalizedUsername]) state[normalizedUsername] = []

    state[normalizedUsername].push(pr)
    return state
  }, {})

  const activeReposLastMonth = prsLastMonth
                                .reduce((state, pr) => {
                                  if (!state[pr.repo_key]) state[pr.repo_key] = []

                                  state[pr.repo_key].push(pr)
                                  return state
                                }, {})

  const payload = {
    organization: boldTextInHtml(GITHUB_ORG_NAME),
    repos: {
      count: repos.keys().length,
      pr_authors: users.keys().reduce((state, user) => {
        const userPrs = pulls.index_get('author:'+ user)
        return userPrs.length > 0
          ? state + 1
          : state
      }, 0),
      prs: pulls.keys().length,
    },
    data_size: orgDataSize,
    breadcrumb: '<a href='+ escapeHtml('/') + '>home</a>',
    stats: [
      {
        when: ''
          + boldTextInHtml('this week')
          + ' '
          + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
            + prsThisWeek.length +' '+ (prsThisWeek.length !== 1 ? 'pulls' : 'pull')
            + ', '
            + Object.keys(prsThisWeekAuthors).length +' '+ (Object.keys(prsThisWeekAuthors).length !== 1 ? 'authors' : 'author')
            + ', '
            + Object.keys(activeReposThisWeek).length +' '+ (Object.keys(activeReposThisWeek).length !== 1 ? 'repos' : 'repo')
          + '</span>',
        most_prolific_pr_authors: Object
                                    .keys(prsThisWeekAuthors)
                                    .sort((a,b) => {
                                      const aPrsThisWeek = prsThisWeekAuthors[a]
                                      const bPrsThisWeek = prsThisWeekAuthors[b]

                                      if (aPrsThisWeek.length > bPrsThisWeek.length) return -1
                                      if (aPrsThisWeek.length < bPrsThisWeek.length) return 1
                                      return 0
                                    })
                                    .slice(0, 3)
                                    .reduce((state, username) => {
                                      const normalizedUsername = username.toLowerCase()
                                      const totalUserPrsThisWeek = prsThisWeekAuthors[normalizedUsername].length
                                      const reposThisWeek = prsThisWeekAuthors[normalizedUsername]
                                                                  .reduce((state, pr) => {
                                                                    if (!state.includes(pr.repo_key)) state.push(pr.repo_key)
                                                                    return state
                                                                  }, [])

                                      state.push(''
                                        + '<a href='+ escapeHtml('/users/'+ normalizedUsername) + '>'+ username + '</a>'
                                        + ' '
                                        + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
                                        + totalUserPrsThisWeek +' '+ (totalUserPrsThisWeek !== 1 ? 'pulls' : 'pull')
                                          + ', '
                                          + reposThisWeek.length +' '+ (reposThisWeek.length !== 1 ? 'repos' : 'repo')
                                        + '</span>'
                                      )
                                      return state
                                    }, []),
        most_active_repos: Object
                            .keys(activeReposThisWeek)
                            .sort((a,b) => {
                              const aPrsThisWeek = activeReposThisWeek[a].length
                              const bPrsThisWeek = activeReposThisWeek[b].length

                              if (aPrsThisWeek > bPrsThisWeek) return -1
                              if (aPrsThisWeek < bPrsThisWeek) return 1
                              return 0
                            })
                            .slice(0,3)
                            .reduce((state, repoName) => {
                              const authorsThisWeek = activeReposThisWeek[repoName]
                                                .reduce((state, pr) => {
                                                  if (!state[pr.user_key]) state[pr.user_key] = 0
                                                  state[pr.user_key] += 1
                                                  return state
                                                }, {})
                              const totalAuthorsThisWeek = Object.keys(authorsThisWeek).length

                              state.push( ''
                                + repoName
                                + ' '
                                + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
                                  + activeReposThisWeek[repoName].length +' '+ (activeReposThisWeek[repoName].length !== 1 ? 'pulls' : 'pull')
                                  + ', '
                                  + totalAuthorsThisWeek +' '+ (totalAuthorsThisWeek !== 1 ? 'authors' : 'author')
                                + '</span>'
                              )

                              return state
                            }, [])
      },
      {
        when: ''
          + boldTextInHtml('last week')
          + ' '
          + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
            + prsLastWeek.length +' '+ (prsLastWeek.length !== 1 ? 'pulls' : 'pull')
            + ', '
            + Object.keys(prsLastWeekAuthors).length +' '+ (Object.keys(prsLastWeekAuthors).length !== 1 ? 'authors' : 'author')
            + ', '
            + Object.keys(activeReposLastWeek).length +' '+ (Object.keys(activeReposLastWeek).length !== 1 ? 'repos' : 'repo')
          + '</span>',
        most_prolific_pr_authors: Object
                                    .keys(prsLastWeekAuthors)
                                    .sort((a,b) => {
                                      const aPrsLastWeek = prsLastWeekAuthors[a]
                                      const bPrsLastWeek = prsLastWeekAuthors[b]

                                      if (aPrsLastWeek.length > bPrsLastWeek.length) return -1
                                      if (aPrsLastWeek.length < bPrsLastWeek.length) return 1
                                      return 0
                                    })
                                    .slice(0, 3)
                                    .reduce((state, username) => {
                                      const normalizedUsername = username.toLowerCase()
                                      const totalUserPrsLastWeek = prsLastWeekAuthors[normalizedUsername].length
                                      const reposLastWeek = prsLastWeekAuthors[normalizedUsername]
                                                                  .reduce((state, pr) => {
                                                                    if (!state.includes(pr.repo_key)) state.push(pr.repo_key)
                                                                    return state
                                                                  }, [])

                                      state.push(''
                                        + '<a href='+ escapeHtml('/users/'+ normalizedUsername) + '>'+ username + '</a>'
                                        + ' '
                                        + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
                                        + totalUserPrsLastWeek +' pulls,'
                                          + ' '
                                          + reposLastWeek.length +' '+ (reposLastWeek.length !== 1 ? 'repos' : 'repo')
                                        + '</span>'
                                      )
                                      return state
                                    }, []),
        most_active_repos: Object
                            .keys(activeReposLastWeek)
                            .sort((a,b) => {
                              const aPrsLastWeek = activeReposLastWeek[a].length
                              const bPrsLastWeek = activeReposLastWeek[b].length

                              if (aPrsLastWeek > bPrsLastWeek) return -1
                              if (aPrsLastWeek < bPrsLastWeek) return 1
                              return 0
                            })
                            .slice(0,3)
                            .reduce((state, repoName) => {
                              const authorsLastWeek = activeReposLastWeek[repoName]
                                                .reduce((state, pr) => {
                                                  if (!state[pr.user_key]) state[pr.user_key] = 0
                                                  state[pr.user_key] += 1
                                                  return state
                                                }, {})
                              const totalAuthorsLastWeek = Object.keys(authorsLastWeek).length

                              state.push( ''
                                + repoName
                                + ' '
                                + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
                                  + activeReposLastWeek[repoName].length +' '+ (activeReposLastWeek[repoName].length !== 1 ? 'pulls' : 'pull')
                                  + ', '
                                  + totalAuthorsLastWeek +' '+ (totalAuthorsLastWeek !== 1 ? 'authors' : 'author')
                                + '</span>'
                              )

                              return state
                            }, [])
      },
      {
        when: ''
          + boldTextInHtml('this month')
          + ' '
          + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
            + prsThisMonth.length +' '+ (prsThisMonth.length !== 1 ? 'pulls' : 'pull')
            + ', '
            + Object.keys(prsThisMonthAuthors).length +' '+ (Object.keys(prsThisMonthAuthors).length !== 1 ? 'authors' : 'author')
            + ', '
            + Object.keys(activeReposThisMonth).length +' '+ (Object.keys(activeReposThisMonth).length !== 1 ? 'repos' : 'repo')
          + '</span>',
        most_prolific_pr_authors: Object
                                    .keys(prsThisMonthAuthors)
                                    .sort((a,b) => {
                                      const aPrsThisMonth = prsThisMonthAuthors[a]
                                      const bPrsThisMonth = prsThisMonthAuthors[b]

                                      if (aPrsThisMonth.length > bPrsThisMonth.length) return -1
                                      if (aPrsThisMonth.length < bPrsThisMonth.length) return 1
                                      return 0
                                    })
                                    .slice(0, 3)
                                    .reduce((state, username) => {
                                      const normalizedUsername = username.toLowerCase()
                                      const totalUserPrsThisMonth = prsThisMonthAuthors[normalizedUsername].length
                                      const reposThisMonth = prsThisMonthAuthors[normalizedUsername]
                                                                  .reduce((state, pr) => {
                                                                    if (!state.includes(pr.repo_key)) state.push(pr.repo_key)
                                                                    return state
                                                                  }, [])

                                      state.push(''
                                        + '<a href='+ escapeHtml('/users/'+ normalizedUsername) + '>'+ username + '</a>'
                                        + ' '
                                        + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
                                        + totalUserPrsThisMonth +' '+ (totalUserPrsThisMonth !== 1 ? 'pulls' : 'pull')
                                          + ', '
                                          + reposThisMonth.length +' '+ (reposThisMonth.length !== 1 ? 'repos' : 'repo')
                                        + '</span>'
                                      )
                                      return state
                                    }, []),
        most_active_repos: Object
                            .keys(activeReposThisMonth)
                            .sort((a,b) => {
                              const aPrsThisMonth = activeReposThisMonth[a].length
                              const bPrsThisMonth = activeReposThisMonth[b].length

                              if (aPrsThisMonth > bPrsThisMonth) return -1
                              if (aPrsThisMonth < bPrsThisMonth) return 1
                              return 0
                            })
                            .slice(0,3)
                            .reduce((state, repoName) => {
                              const authorsThisMonth = activeReposThisMonth[repoName]
                                                .reduce((state, pr) => {
                                                  if (!state[pr.user_key]) state[pr.user_key] = 0
                                                  state[pr.user_key] += 1
                                                  return state
                                                }, {})
                              const totalAuthorsThisMonth = Object.keys(authorsThisMonth).length

                              state.push( ''
                                + repoName
                                + ' '
                                + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
                                  + activeReposThisMonth[repoName].length +' '+ (activeReposThisMonth[repoName].length !== 1 ? 'pulls' : 'pull')
                                  + ', '
                                  + totalAuthorsThisMonth +' '+ (totalAuthorsThisMonth !== 1 ? 'authors' : 'author')
                                + '</span>'
                              )

                              return state
                            }, [])
      },
      {
        when: ''
          + boldTextInHtml('last month')
          + ' '
          + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
            + prsLastMonth.length +' '+ (prsLastMonth.length !== 1 ? 'pulls' : 'pull')
            + ', '
            + Object.keys(prsLastMonthAuthors).length +' '+ (Object.keys(prsLastMonthAuthors).length !== 1 ? 'authors' : 'author')
            + ', '
            + Object.keys(activeReposLastMonth).length +' '+ (Object.keys(activeReposLastMonth).length !== 1 ? 'repos' : 'repo')
          + '</span>',
        most_prolific_pr_authors: Object
                                    .keys(prsLastMonthAuthors)
                                    .sort((a,b) => {
                                      const aPrsLastMonth = prsLastMonthAuthors[a]
                                      const bPrsLastMonth = prsLastMonthAuthors[b]

                                      if (aPrsLastMonth.length > bPrsLastMonth.length) return -1
                                      if (aPrsLastMonth.length < bPrsLastMonth.length) return 1
                                      return 0
                                    })
                                    .slice(0, 3)
                                    .reduce((state, username) => {
                                      const normalizedUsername = username.toLowerCase()
                                      const totalUserPrsLastMonth = prsLastMonthAuthors[normalizedUsername].length
                                      const reposLastMonth = prsLastMonthAuthors[normalizedUsername]
                                                                  .reduce((state, pr) => {
                                                                    if (!state.includes(pr.repo_key)) state.push(pr.repo_key)
                                                                    return state
                                                                  }, [])

                                      state.push(''
                                        + '<a href='+ escapeHtml('/users/'+ normalizedUsername) + '>'+ username + '</a>'
                                        + ' '
                                        + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
                                        + totalUserPrsLastMonth +' '+ (totalUserPrsLastMonth !== 1 ? 'pulls' : 'pull')
                                          + ', '
                                          + reposLastMonth.length +' '+ (reposLastMonth.length !== 1 ? 'repos' : 'repo')
                                        + '</span>'
                                      )
                                      return state
                                    }, []),
        most_active_repos: Object
                            .keys(activeReposLastMonth)
                            .sort((a,b) => {
                              const aPrsLastMonth = activeReposLastMonth[a].length
                              const bPrsLastMonth = activeReposLastMonth[b].length

                              if (aPrsLastMonth > bPrsLastMonth) return -1
                              if (aPrsLastMonth < bPrsLastMonth) return 1
                              return 0
                            })
                            .slice(0,3)
                            .reduce((state, repoName) => {
                              const authorsLastMonth = activeReposLastMonth[repoName]
                                                .reduce((state, pr) => {
                                                  if (!state[pr.user_key]) state[pr.user_key] = 0
                                                  state[pr.user_key] += 1
                                                  return state
                                                }, {})
                              const totalAuthorsLastMonth = Object.keys(authorsLastMonth).length

                              state.push( ''
                                + repoName
                                + ' '
                                + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
                                  + activeReposLastMonth[repoName].length +' '+ (activeReposLastMonth[repoName].length !== 1 ? 'pulls' : 'pull')
                                  + ', '
                                  + totalAuthorsLastMonth +' '+ (totalAuthorsLastMonth !== 1 ? 'authors' : 'author')
                                + '</span>'
                              )

                              return state
                            }, [])
      }
    ]
  }

  ctx.body = createHtmlResponse(
    '<pre>' + JSON.stringify(payload, null, 2) + '</pre>'
  )
}

module.exports = {
  listStats,
}